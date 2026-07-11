import type { SyncResult } from './types';

/**
 * Resend is our transactional email provider — unlike Mailchimp's marketing
 * API it can send one-off mail such as magic-link login emails. Enabled once
 * both RESEND_API_KEY and a verified EMAIL_FROM sender are set.
 */
export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Sends one transactional email via Resend's REST API. Never throws. */
export async function sendResendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SyncResult> {
  const apiKey = process.env.RESEND_API_KEY!;
  const from = process.env.EMAIL_FROM!;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return { ok: false, detail: `Resend send failed (${res.status}): ${await res.text()}` };
    }
    return { ok: true, detail: `Resend: emailed ${input.to} — "${input.subject}".` };
  } catch (err) {
    return { ok: false, detail: `Resend request error: ${(err as Error).message}` };
  }
}
