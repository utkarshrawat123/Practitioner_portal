import { createAuthToken, findByEmail } from '@/lib/db';
import { portalUrl } from '@/lib/codes';
import { magicLinkEmail } from '@/lib/emails/templates';
import { resendConfigured, sendResendEmail } from '@/lib/providers/resend';
import { smtpConfigured, sendSmtpEmail } from '@/lib/providers/smtp';

export interface MagicLinkSender {
  name: string;
  send(input: { email: string; url: string }): Promise<void>;
}

const mockSender: MagicLinkSender = {
  name: 'mock',
  async send({ email, url }) {
    console.log(`[mock magic-link] login link for ${email}: ${url}`);
  },
};

/** Emails the one-time login link via Resend (transactional). */
const resendSender: MagicLinkSender = {
  name: 'resend',
  async send({ email, url }) {
    const { subject, html } = magicLinkEmail({ url });
    const res = await sendResendEmail({ to: email, subject, html });
    // Never throw from the auth flow — a delivery failure is logged, and the
    // caller returns an identical response either way (no account enumeration).
    if (!res.ok) console.error(`[magic-link] Resend delivery failed: ${res.detail}`);
  },
};

/** Emails the one-time login link via Gmail SMTP (no domain needed). */
const smtpSender: MagicLinkSender = {
  name: 'smtp',
  async send({ email, url }) {
    const { subject, html } = magicLinkEmail({ url });
    const res = await sendSmtpEmail({ to: email, subject, html });
    if (!res.ok) console.error(`[magic-link] Gmail SMTP delivery failed: ${res.detail}`);
  },
};

/**
 * Mailchimp's marketing API cannot send transactional mail, so login links go
 * through Resend or Gmail SMTP when configured, else the mock sender (which
 * exposes devLink for on-screen testing).
 */
export function getMagicLinkSender(): MagicLinkSender {
  if (resendConfigured()) return resendSender;
  if (smtpConfigured()) return smtpSender;
  return mockSender;
}

/** Always resolves; devLink is only populated when the sender is the mock. */
export async function requestLoginLink(email: string): Promise<{ devLink: string | null }> {
  const practitioner = await findByEmail(email);
  if (!practitioner || practitioner.status !== 'approved') return { devLink: null };
  const token = await createAuthToken(practitioner.id);
  const url = `${portalUrl()}/api/auth/verify?token=${token}`;
  const sender = getMagicLinkSender();
  await sender.send({ email: practitioner.email, url });
  return { devLink: sender.name === 'mock' ? url : null };
}
