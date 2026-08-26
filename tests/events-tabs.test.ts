import { describe, it, expect } from 'vitest';
import { filterEventsForTab, type TabbableEvent } from '@/lib/events/tabs';

const NOW = new Date('2026-06-15T12:00:00Z').getTime();

function ev(over: Partial<TabbableEvent> = {}): TabbableEvent {
  return {
    id: 1,
    startsAt: '2026-07-01T10:00:00Z', // future relative to NOW
    eventType: 'online',
    recordingUrl: null,
    registered: false,
    ...over,
  };
}

describe('filterEventsForTab', () => {
  it('upcoming shows future events', () => {
    const e = ev();
    expect(filterEventsForTab([e], 'upcoming', NOW)).toEqual([e]);
  });

  it('upcoming hides past events', () => {
    const e = ev({ startsAt: '2026-01-01T10:00:00Z' });
    expect(filterEventsForTab([e], 'upcoming', NOW)).toEqual([]);
  });

  it('upcoming still shows a future event that already has a recording attached', () => {
    // A recording can be pre-attached; that must not remove it from Upcoming,
    // which is what the original filter did.
    const e = ev({ recordingUrl: 'https://example.org/r' });
    expect(filterEventsForTab([e], 'upcoming', NOW)).toEqual([e]);
  });

  it('live shows only future online events', () => {
    const online = ev();
    const inPerson = ev({ id: 2, eventType: 'in_person' });
    const pastOnline = ev({ id: 3, startsAt: '2026-01-01T10:00:00Z' });
    expect(filterEventsForTab([online, inPerson, pastOnline], 'live', NOW)).toEqual([online]);
  });

  it('on-demand shows past events, whether or not a recording exists yet', () => {
    const withRec = ev({ id: 1, startsAt: '2026-01-01T10:00:00Z', recordingUrl: 'https://example.org/r' });
    const withoutRec = ev({ id: 2, startsAt: '2026-02-01T10:00:00Z' });
    const future = ev({ id: 3 });
    const got = filterEventsForTab([withRec, withoutRec, future], 'ondemand', NOW).map((e) => e.id);
    expect(got).toEqual([1, 2]);
  });

  it('on-demand also shows a future event that already has a recording', () => {
    const e = ev({ recordingUrl: 'https://example.org/r' });
    expect(filterEventsForTab([e], 'ondemand', NOW)).toEqual([e]);
  });

  it('mine shows registered events regardless of date', () => {
    const past = ev({ id: 1, startsAt: '2026-01-01T10:00:00Z', registered: true });
    const future = ev({ id: 2, registered: true });
    const other = ev({ id: 3 });
    expect(filterEventsForTab([past, future, other], 'mine', NOW).map((e) => e.id)).toEqual([1, 2]);
  });

  it('NO EVENT IS INVISIBLE — every event appears in at least one tab', () => {
    const events: TabbableEvent[] = [
      ev({ id: 1 }),                                                        // future, online, no recording
      ev({ id: 2, eventType: 'in_person' }),                                // future, in person
      ev({ id: 3, startsAt: '2026-01-01T10:00:00Z' }),                      // past, no recording  ← used to vanish
      ev({ id: 4, startsAt: '2026-01-01T10:00:00Z', recordingUrl: 'https://x/r' }), // past, recorded
      ev({ id: 5, eventType: 'in_person', startsAt: '2026-02-02T10:00:00Z' }),      // past, in person ← used to vanish
    ];
    const tabs = ['upcoming', 'live', 'ondemand', 'mine'] as const;
    for (const e of events) {
      const seen = tabs.some((t) => filterEventsForTab(events, t, NOW).some((x) => x.id === e.id));
      expect(seen, `event ${e.id} is not reachable from any tab`).toBe(true);
    }
  });
});
