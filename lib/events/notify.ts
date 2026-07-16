import { smtpConfigured, sendSmtpEmail } from '@/lib/providers/smtp';
import { buildIcs } from './ics';
import type { HubEvent, Practitioner } from '@/lib/db';
import type { SyncResult } from '@/lib/providers/types';

/** Sends an event-registration confirmation with an .ics attachment. Never throws. */
export async function sendEventConfirmation(practitioner: Practitioner, event: HubEvent): Promise<SyncResult> {
  const portalUrl = process.env.PORTAL_URL || 'http://localhost:3100';
  const ics = buildIcs(event, portalUrl);
  const when = new Date(event.startsAt).toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
  });
  const where = event.eventType === 'online'
    ? `Online${event.location ? ` — <a href="${event.location}">join link</a>` : ''}`
    : (event.location || 'To be confirmed');

  const html = `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#191919">
      <h1 style="font-size:22px;color:#3a4f41">You're registered</h1>
      <p>Hi ${practitioner.name.split(' ')[0]}, you're booked in for:</p>
      <div style="border-left:3px solid #a45248;padding:8px 16px;background:#f8f6f3">
        <p style="font-size:18px;margin:0 0 6px"><strong>${event.title}</strong></p>
        <p style="margin:0;color:#555">${when} (UK time)</p>
        <p style="margin:4px 0 0;color:#555">${where}</p>
      </div>
      <p style="font-size:13px;color:#777">A calendar invite is attached. See all your events at ${portalUrl}/events.</p>
    </div>`;

  if (!smtpConfigured()) {
    return { ok: true, detail: `Mock: event confirmation for ${practitioner.email} — "${event.title}" (ICS built, ${ics.length} bytes).` };
  }
  return sendSmtpEmail({
    to: practitioner.email,
    subject: `You're registered: ${event.title}`,
    html,
    attachments: [{ filename: 'event.ics', content: ics, contentType: 'text/calendar' }],
  });
}
