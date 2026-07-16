import { hasEmailBeenSent, logEmailSent, type Practitioner } from '@/lib/db';
import { smtpConfigured, sendSmtpEmail } from '@/lib/providers/smtp';

/**
 * Sends a lifecycle email at most once per (practitioner, job, period).
 * In mock mode (no SMTP) it logs a would-send. On a real send failure it does
 * NOT record the log, so the next run retries.
 */
export async function sendOnce(
  p: Practitioner, job: string, period: string, subject: string, html: string
): Promise<'sent' | 'skipped' | 'error'> {
  if (await hasEmailBeenSent(p.id, job, period)) return 'skipped';
  let detail = `mock: ${job} ${period}`;
  if (smtpConfigured()) {
    const r = await sendSmtpEmail({ to: p.email, subject, html });
    if (!r.ok) return 'error';
    detail = r.detail;
  }
  await logEmailSent(p.id, job, period, detail);
  return 'sent';
}
