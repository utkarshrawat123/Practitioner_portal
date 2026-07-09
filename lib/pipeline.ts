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
  if (await findByEmail(input.email)) throw new DuplicateEmailError(input.email);

  const adapter = getRegister(input.registerBody);
  if (!adapter) throw new Error(`Unknown register body: ${input.registerBody}`);

  const record = await insertApplication(input);
  await addEvent(record.id, 'application', `Application received for ${adapter.id} #${input.registerNumber}`);

  const isDuplicate = await hasDuplicateRegistration(input.registerBody, input.registerNumber, record.id);

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
  const flagged = await flagPractitioner(record.id, verification);
  await addEvent(record.id, 'decision', `Flagged for review: ${decision.reasonCode} — ${lookupDetail}`);
  return flagged;
}

export async function approvePractitioner(id: number, decidedBy: string): Promise<Practitioner> {
  const existing = await getPractitioner(id);
  if (!existing) throw new Error(`No practitioner with id ${id}`);
  if (existing.status === 'approved' && existing.affiliateCode) return existing; // idempotent
  return finalizeApproval(id, existing.verification, decidedBy);
}

export async function rejectPractitioner(id: number, decidedBy: string): Promise<Practitioner> {
  const rejected = await markRejected(id, decidedBy);
  await addEvent(id, 'decision', `Rejected by ${decidedBy}`);
  return rejected;
}

export async function retrySync(id: number): Promise<Practitioner> {
  const p = await getPractitioner(id);
  if (!p || p.status !== 'approved' || !p.affiliateCode || !p.affiliateLink) {
    throw new Error(`Practitioner ${id} is not an approved record awaiting sync`);
  }
  const ok = await runExternalSync(p.id, p.name, p.email, p.affiliateCode, p.affiliateLink);
  await setPendingSync(id, !ok);
  return (await getPractitioner(id))!;
}

async function finalizeApproval(
  id: number,
  verification: Verification | null,
  decidedBy: string
): Promise<Practitioner> {
  const record = (await getPractitioner(id))!;
  const code = await generateCode(record.name, isCodeTaken);
  const link = referralLink(code);
  const synced = await runExternalSync(id, record.name, record.email, code, link);
  const approved = await markApproved(id, {
    verification: verification ?? undefined,
    affiliateCode: code,
    affiliateLink: link,
    pendingSync: !synced,
    decidedBy,
  });
  await addEvent(id, 'decision', `Approved by ${decidedBy} — code ${code}${synced ? '' : ' (external sync pending)'}`);
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
  await addEvent(id, 'affiliate', affiliate.detail);
  const welcome = await getEmailProvider().sendWelcome({ name, email, code, link });
  await addEvent(id, 'email', welcome.detail);
  return affiliate.ok && welcome.ok;
}
