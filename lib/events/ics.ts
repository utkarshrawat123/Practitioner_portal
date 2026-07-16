import type { HubEvent } from '@/lib/db';

/** ISO datetime → ICS UTC stamp (YYYYMMDDTHHMMSSZ). */
function fmt(dt: string): string {
  return new Date(dt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function esc(s: string): string {
  return s.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');
}

/** Builds an RFC-5545 VEVENT the practitioner can add to their calendar. */
export function buildIcs(event: HubEvent, portalUrl: string): string {
  const start = fmt(event.startsAt);
  const end = event.endsAt
    ? fmt(event.endsAt)
    : fmt(new Date(new Date(event.startsAt).getTime() + 60 * 60 * 1000).toISOString());
  const location = event.eventType === 'online'
    ? (event.location || `${portalUrl}/events`)
    : (event.location || '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wild Nutrition//Practitioner Hub//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:wn-event-${event.id}@wildnutrition`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${esc(event.title)}`,
    `DESCRIPTION:${esc(event.description || '')}`,
    `LOCATION:${esc(location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
