import { conversationsAwaitingAlert, markConversationAlerted } from '@/lib/db';
import { smtpConfigured, sendSmtpEmail } from '@/lib/providers/smtp';
import { portalUrl as basePortalUrl } from '@/lib/codes';
import { supportEmail } from '@/lib/support';

/**
 * Where missed-message alerts go: an explicit ops inbox, else the support
 * address. Null when neither is configured — alerts are then skipped rather
 * than delivered somewhere arbitrary.
 */
export function alertRecipient(): string | null {
  return (process.env.ADMIN_ALERT_EMAIL ?? '').trim() || supportEmail();
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
  skippedNoRecipient: boolean;
}> {
  void now;
  const due = await conversationsAwaitingAlert(alertThresholdMinutes());
  const smtp = smtpConfigured();
  const to = alertRecipient();
  // Use the canonical PORTAL_URL helper rather than a second hardcoded default —
  // the old fallback pointed at the retired Vercel deployment.
  const portalUrl = basePortalUrl().replace(/\/$/, '');
  let alerted = 0;
  for (const convo of due) {
    if (smtp && to) {
      const res = await sendSmtpEmail({
        to,
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
  return { checked: due.length, alerted, skippedNoSmtp: !smtp, skippedNoRecipient: !to };
}
