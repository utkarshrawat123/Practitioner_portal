import { conversationsAwaitingAlert, markConversationAlerted } from '@/lib/db';
import { smtpConfigured, sendSmtpEmail } from '@/lib/providers/smtp';

/** Where missed-message alerts go. Contact inbox by default; overridable. */
export function alertRecipient(): string {
  return process.env.ADMIN_ALERT_EMAIL || 'utkarshrawatofficial@gmail.com';
}

/** Minutes a practitioner message may wait unanswered before the email fires. */
export function alertThresholdMinutes(): number {
  const n = Number(process.env.CHAT_ALERT_MINUTES);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

function alertHtml(name: string, portalUrl: string): string {
  return `<div style="font-family:Arial,sans-serif;font-size:15px;color:#191919">
    <p>A practitioner is waiting for a reply in the live chat.</p>
    <p><strong>${name}</strong> sent a message that hasn't been answered yet.</p>
    <p><a href="${portalUrl}/admin" style="color:#a45248">Open the admin console → Live Chat</a></p>
    <p style="font-size:13px;color:#666">You're receiving this because no reply was sent within
    ${alertThresholdMinutes()} minutes. One reminder is sent per waiting conversation.</p>
  </div>`;
}

/**
 * Send one email per conversation that has been waiting past the threshold and
 * hasn't already been alerted for this wait. Returns a summary. No-ops (but still
 * marks) when SMTP is unconfigured so local/mock runs don't error.
 */
export async function sendChatAlerts(now = new Date()): Promise<{
  checked: number;
  alerted: number;
  skippedNoSmtp: boolean;
}> {
  void now;
  const due = await conversationsAwaitingAlert(alertThresholdMinutes());
  const smtp = smtpConfigured();
  const portalUrl = (process.env.PORTAL_URL || 'https://practitioner-portal-rose.vercel.app').replace(/\/$/, '');
  let alerted = 0;
  for (const convo of due) {
    if (smtp) {
      const res = await sendSmtpEmail({
        to: alertRecipient(),
        subject: `New practitioner chat waiting — ${convo.practitionerName}`,
        html: alertHtml(convo.practitionerName, portalUrl),
      });
      if (!res.ok) {
        console.error(`[chat-alerts] email failed for convo ${convo.id}: ${res.detail}`);
        continue; // leave un-alerted so the next run retries
      }
    }
    await markConversationAlerted(convo.id);
    alerted += 1;
  }
  return { checked: due.length, alerted, skippedNoSmtp: !smtp };
}
