import { createHmac, timingSafeEqual } from 'crypto';
import { portalUrl } from '@/lib/codes';
import { certificationRequestEmail } from '@/lib/emails/templates';
import { resendConfigured, sendResendEmail } from '@/lib/providers/resend';
import { smtpConfigured, sendSmtpEmail } from '@/lib/providers/smtp';
import type { Practitioner } from '@/lib/db';

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function secret(): string {
  return process.env.SESSION_SECRET || 'dev-secret-change-me';
}

// Purpose-scoped ("cert:") so a certification token can never be replayed as a
// login session token (and vice versa) — the HMAC covers the prefix.
function sign(payload: string): string {
  return createHmac('sha256', secret()).update(`cert:${payload}`).digest('hex');
}

/** A signed, self-expiring token that lets a not-yet-approved student upload their cert. */
export function createCertUploadToken(
  practitionerId: number,
  expiresAtMs: number = Date.now() + FOURTEEN_DAYS_MS
): string {
  const payload = `${practitionerId}.${expiresAtMs}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyCertUploadToken(value: string): number | null {
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [idStr, expStr, mac] = parts;
  const expected = sign(`${idStr}.${expStr}`);
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  } catch {
    return null;
  }
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const id = Number(idStr);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function certificationUploadUrl(token: string): string {
  return `${portalUrl()}/upload-certification?token=${token}`;
}

export interface CertRequestSender {
  name: string;
  send(input: { email: string; name: string; uploadUrl: string }): Promise<{ ok: boolean; detail: string }>;
}

const mockSender: CertRequestSender = {
  name: 'mock',
  async send({ email, uploadUrl }) {
    console.log(`[mock cert-request] upload link for ${email}: ${uploadUrl}`);
    return { ok: true, detail: `Mock mode: cert-request email for ${email} logged only.` };
  },
};

function realSender(name: 'resend' | 'smtp'): CertRequestSender {
  return {
    name,
    async send({ email, name: who, uploadUrl }) {
      const { subject, html } = certificationRequestEmail({ name: who, uploadUrl });
      return name === 'resend'
        ? sendResendEmail({ to: email, subject, html })
        : sendSmtpEmail({ to: email, subject, html });
    },
  };
}

/** Same provider order as the rest of the app: Resend > Gmail SMTP > mock. */
export function getCertRequestSender(): CertRequestSender {
  if (resendConfigured()) return realSender('resend');
  if (smtpConfigured()) return realSender('smtp');
  return mockSender;
}

/**
 * Emails a student a secure link to upload their certification. Returns the
 * sender outcome + (mock only) the dev link for on-screen testing. Never throws.
 */
export async function sendCertificationRequest(
  practitioner: Pick<Practitioner, 'id' | 'name' | 'email'>
): Promise<{ ok: boolean; detail: string; devLink: string | null }> {
  const token = createCertUploadToken(practitioner.id);
  const uploadUrl = certificationUploadUrl(token);
  const sender = getCertRequestSender();
  const res = await sender.send({ email: practitioner.email, name: practitioner.name, uploadUrl });
  return { ...res, devLink: sender.name === 'mock' ? uploadUrl : null };
}
