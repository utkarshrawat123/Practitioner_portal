import { describe, it, expect } from 'vitest';
import {
  shouldPoll,
  nextPollDelay,
  FAST_MS,
  CLOSED_BASE_MS,
  CLOSED_MAX_MS,
} from '@/lib/chat/pollPolicy';

describe('chat poll policy', () => {
  it('a hidden tab never polls', () => {
    expect(shouldPoll(false)).toBe(false);
  });

  it('a visible tab may poll', () => {
    expect(shouldPoll(true)).toBe(true);
  });

  it('polls fast while the panel is open, regardless of prior backoff', () => {
    expect(
      nextPollDelay({ open: true, visible: true, gotNew: false, currentDelay: CLOSED_MAX_MS })
    ).toBe(FAST_MS);
  });

  it('resets to the base cadence when a closed panel receives a new message', () => {
    expect(
      nextPollDelay({ open: false, visible: true, gotNew: true, currentDelay: CLOSED_MAX_MS })
    ).toBe(CLOSED_BASE_MS);
  });

  it('backs off when a closed panel stays quiet', () => {
    const next = nextPollDelay({
      open: false,
      visible: true,
      gotNew: false,
      currentDelay: CLOSED_BASE_MS,
    });
    expect(next).toBeGreaterThan(CLOSED_BASE_MS);
    expect(next).toBeLessThanOrEqual(CLOSED_MAX_MS);
  });

  it('never backs off beyond the cap', () => {
    expect(
      nextPollDelay({ open: false, visible: true, gotNew: false, currentDelay: CLOSED_MAX_MS })
    ).toBe(CLOSED_MAX_MS);
  });

  it('drops out of fast polling as soon as the panel is closed', () => {
    // Panel was just closed (currentDelay still at the fast cadence) and it is quiet:
    // the next delay must jump to at least the closed base, not keep fast-polling.
    const next = nextPollDelay({
      open: false,
      visible: true,
      gotNew: false,
      currentDelay: FAST_MS,
    });
    expect(next).toBeGreaterThanOrEqual(CLOSED_BASE_MS);
  });
});
