import {
  addEvent,
  findByEmail,
  flagPractitioner,
  getPractitioner,
  hasDuplicateRegistration,
  insertApplication,
  isCodeTaken,
  markApproved,
  markRejected,
  setPendingSync,
  type Practitioner,
  type QualificationStatus,
  type Verification,
} from '@/lib/db';
import { decide, type Confidence } from '@/lib/decision';
import { getRegister } from '@/lib/registers';
import { getAffiliateProvider } from '@/lib/providers/affiliates';
import { getEmailProvider } from '@/lib/providers/email';
import { generateCode, referralLink } from '@/lib/codes';

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`An application already exists for ${email}`);
  }
}

export interface ApplicationInput {
  name: string;
  email: string;
  registerBody: string;
  registerNumber: string;
  qualificationStatus: QualificationStatus;
}

export async function processApplication(input: ApplicationInput): Promise<Practitioner> {
  if (findByEmail(input.email)) throw new DuplicateEmailError(input.email);

  const adapter = getRegister(input.registerBody);
  if (!adapter) throw new Error(`Unknown register body: ${input.registerBody}`);

  const record = insertApplication(input);
  addEvent(record.id, 'application', `Application received for ${adapter.id} #${input.registerNumber}`);

  const isDuplicate = hasDuplicateRegistration(input.registerBody, input.registerNumber, record.id);

  let confidence: Confidence | null = null;
  let lookupDetail = 'Lookup skipped.';
  const skipLookup = isDuplicate || input.qualificationStatus === 'student';
  if (!skipLookup) {
    const result = await adapter.lookup(input.name, input.registerNumber);
    confidence = result.confidence;
    lookupDetail = result.detail;
  } else if (input.qualificationStatus === 'student') {
    lookupDetail = 'Student application — no public register entry to verify.';
  } else {
    lookupDetail = `Register number ${input.registerNumber} already exists on another ${adapter.id} application.`;
  }

  const decision = decide({
    qualificationStatus: input.qualificationStatus,
    confidence,
    isDuplicate,
  });

  const verification: Verification = {
    reasonCode: decision.reasonCode,
    confidence,
    detail: lookupDetail,
    manualSearchUrl: adapter.manualSearchUrl(input.name),
  };

  if (decision.status === 'approved') {
    return finalizeApproval(record.id, verification, 'system');
  }
  const flagged = flagPractitioner(record.id, verification);
  addEvent(record.id, 'decision', `Flagged for review: ${decision.reasonCode} — ${lookupDetail}`);
  return flagged;
}

export async function approvePractitioner(id: number, decidedBy: string): Promise<Practitioner> {
  const existing = getPractitioner(id);
  if (!existing) throw new Error(`No practitioner with id ${id}`);
  if (existing.status === 'approved' && existing.affiliateCode) return existing; // idempotent
  return finalizeApproval(id, existing.verification, decidedBy);
}

export function rejectPractitioner(id: number, decidedBy: string): Practitioner {
  const rejected = markRejected(id, decidedBy);
  addEvent(id, 'decision', `Rejected by ${decidedBy}`);
  return rejected;
}

export async function retrySync(id: number): Promise<Practitioner> {
  const p = getPractitioner(id);
  if (!p || p.status !== 'approved' || !p.affiliateCode || !p.affiliateLink) {
    throw new Error(`Practitioner ${id} is not an approved record awaiting sync`);
  }
  const ok = await runExternalSync(p.id, p.name, p.email, p.affiliateCode, p.affiliateLink);
  setPendingSync(id, !ok);
  return getPractitioner(id)!;
}

async function finalizeApproval(
  id: number,
  verification: Verification | null,
  decidedBy: string
): Promise<Practitioner> {
  const record = getPractitioner(id)!;
  const code = generateCode(record.name, isCodeTaken);
  const link = referralLink(code);
  const synced = await runExternalSync(id, record.name, record.email, code, link);
  const approved = markApproved(id, {
    verification: verification ?? undefined,
    affiliateCode: code,
    affiliateLink: link,
    pendingSync: !synced,
    decidedBy,
  });
  addEvent(id, 'decision', `Approved by ${decidedBy} — code ${code}${synced ? '' : ' (external sync pending)'}`);
  return approved;
}

/** Runs both external calls; logs each outcome; returns true only if both succeeded. */
async function runExternalSync(
  id: number,
  name: string,
  email: string,
  code: string,
  link: string
): Promise<boolean> {
  const affiliate = await getAffiliateProvider().createAffiliate({ code, name, email });
  addEvent(id, 'affiliate', affiliate.detail);
  const welcome = await getEmailProvider().sendWelcome({ name, email, code, link });
  addEvent(id, 'email', welcome.detail);
  return affiliate.ok && welcome.ok;
}
