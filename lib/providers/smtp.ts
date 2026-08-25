import type { SyncResult } from './types';
import { supportEmail } from '@/lib/support';

/**
 * Gmail SMTP transactional sender. Unlike Resend it needs no domain
 * verification — a Google account with 2-Step Verification and an App Password
 * can send to anyone. Enabled once GMAIL_USER + GMAIL_APP_PASSWORD are set.
 * App passwords are pasted with spaces; we strip them.
 */
export function smtpConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

/** From header — a display name in front of the authenticated Gmail address. */
function fromHeader(): string {
  const user = process.env.GMAIL_USER!;
  return process.env.EMAIL_FROM || `Wild Nutrition Practitioner Community <${user}>`;
}

// nodemailer is Node-only and cannot run on the Cloudflare Workers runtime.
// Import it lazily so it is never pulled into the Worker module graph — this
// file is statically imported by many callers, but nodemailer only loads when
// an email is actually sent (which on Cloudflare never happens: Resend is used).
async function transport() {
  const { default: nodemailer } = await import('nodemailer');
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER!,
      pass: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
    },
  });
}

/** Sends one email via Gmail SMTP. Never throws. */
export async function sendSmtpEmail(input: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
}): Promise<SyncResult> {
  try {
    const info = await (await transport()).sendMail({
      from: fromHeader(),
      to: input.to,
      replyTo: supportEmail() ?? undefined,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments,
    });
    return { ok: true, detail: `Gmail SMTP: emailed ${input.to} — "${input.subject}" (${info.messageId}).` };
  } catch (err) {
    return { ok: false, detail: `Gmail SMTP error: ${(err as Error).message}` };
  }
}
