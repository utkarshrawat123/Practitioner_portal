/**
 * Which events belong under which Events-hub tab.
 *
 * Extracted from the component so the rule is testable. The original inline
 * version had a hole: `upcoming` required `!recordingUrl` and `ondemand`
 * required `recordingUrl`, so a PAST event with no recording matched no tab at
 * all and silently disappeared from the hub the day after it ran.
 *
 * The rule now is time-based, with recordings as an enhancement rather than the
 * thing that decides visibility:
 *
 *   upcoming  — starts in the future
 *   live      — starts in the future and is online
 *   ondemand  — already happened, OR has a recording attached
 *   mine      — the practitioner is registered, whenever it runs
 *
 * `upcoming ∪ ondemand` therefore covers every event, so nothing can vanish.
 */
export type EventTab = 'upcoming' | 'live' | 'ondemand' | 'mine';

export interface TabbableEvent {
  id: number;
  startsAt: string;
  eventType: 'online' | 'in_person';
  recordingUrl: string | null;
  registered: boolean;
}

export function filterEventsForTab<T extends TabbableEvent>(
  events: T[],
  tab: EventTab,
  now: number = Date.now()
): T[] {
  return events.filter((e) => {
    const isFuture = new Date(e.startsAt).getTime() >= now;
    switch (tab) {
      case 'upcoming':
        return isFuture;
      case 'live':
        return isFuture && e.eventType === 'online';
      case 'ondemand':
        return !isFuture || !!e.recordingUrl;
      case 'mine':
        return e.registered;
    }
  });
}
