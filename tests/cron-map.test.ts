import { describe, it, expect } from 'vitest';
import { cronPathFor } from '@/lib/cron/map';

describe('cronPathFor', () => {
  it('maps the 6am trigger to the automation run', () => {
    expect(cronPathFor('0 6 * * *')).toBe('/api/cron/run');
  });
  it('maps the every-5-minutes trigger to chat alerts', () => {
    // Was daily at 7am — a Vercel Hobby cron cap that no longer applies on
    // Cloudflare. The route itself alerts once per waiting conversation
    // (email_log dedup), so a 5-minute cadence cannot spam.
    expect(cronPathFor('*/5 * * * *')).toBe('/api/cron/chat-alerts');
    expect(cronPathFor('0 7 * * *')).toBeNull();
  });
  it('returns null for an unknown schedule', () => {
    expect(cronPathFor('* * * * *')).toBeNull();
  });
});
