import { describe, it, expect } from 'vitest';
import { cronPathFor } from '@/lib/cron/map';

describe('cronPathFor', () => {
  it('maps the 6am trigger to the automation run', () => {
    expect(cronPathFor('0 6 * * *')).toBe('/api/cron/run');
  });
  it('maps the 7am trigger to chat alerts', () => {
    expect(cronPathFor('0 7 * * *')).toBe('/api/cron/chat-alerts');
  });
  it('returns null for an unknown schedule', () => {
    expect(cronPathFor('* * * * *')).toBeNull();
  });
});
