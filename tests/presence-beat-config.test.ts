import { describe, it, expect } from 'vitest';
import { PRESENCE_BEAT_MS, PRESENCE_WINDOW_SECONDS } from '@/lib/presence/config';

describe('presence heartbeat cadence', () => {
  it('beats more often than the online window so a live tab stays online', () => {
    expect(PRESENCE_BEAT_MS).toBeLessThan(PRESENCE_WINDOW_SECONDS * 1000);
  });

  it('survives a single missed heartbeat without dropping offline', () => {
    // Two beat intervals must still fall inside the online window, so one dropped
    // heartbeat (flaky network, throttled tab) does not flicker the practitioner offline.
    expect(PRESENCE_BEAT_MS * 2).toBeLessThan(PRESENCE_WINDOW_SECONDS * 1000);
  });

  it('is slower than the old 30s cadence, cutting presence writes', () => {
    expect(PRESENCE_BEAT_MS).toBeGreaterThan(30_000);
  });
});
