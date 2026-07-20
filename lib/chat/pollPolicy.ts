/**
 * Pure polling policy for the practitioner live-chat widget.
 *
 * Why this exists: the widget is mounted on every signed-in page, so a naive
 * fixed-interval poll means every practitioner hits the DB every few seconds for
 * the widget's whole lifetime — even with the panel closed and the tab hidden.
 * At scale that dominates serverless invocations. These pure functions keep the
 * *decision* of whether/when to poll testable and out of the React glue.
 *
 * Two regimes:
 *  - Panel OPEN  → poll fast so replies feel live.
 *  - Panel CLOSED → poll slowly, backing off while quiet, just to light the unread dot.
 * A hidden tab never polls in either regime.
 */

/** Cadence while the panel is open and the practitioner is watching. */
export const FAST_MS = 2500;
/** Starting cadence for a closed panel (enough to notice a reply promptly). */
export const CLOSED_BASE_MS = 15000;
/** Slowest a closed, quiet, visible tab will poll. */
export const CLOSED_MAX_MS = 60000;
/** How aggressively a quiet closed panel widens its interval. */
export const BACKOFF_FACTOR = 1.5;

/** Whether the widget should issue a network poll at all right now. */
export function shouldPoll(visible: boolean): boolean {
  return visible;
}

export interface PollState {
  open: boolean;
  visible: boolean;
  /** Did the most recent poll return new messages? */
  gotNew: boolean;
  /** The delay that was used for the poll that just completed. */
  currentDelay: number;
}

/** The delay (ms) to wait before the next poll, given the state after a tick. */
export function nextPollDelay({ open, visible, gotNew, currentDelay }: PollState): number {
  if (open) return FAST_MS;
  if (!visible) return CLOSED_MAX_MS; // parked; shouldPoll() gates the actual request
  if (gotNew) return CLOSED_BASE_MS; // something is happening — return to base cadence
  const from = Math.max(currentDelay, CLOSED_BASE_MS);
  return Math.min(from * BACKOFF_FACTOR, CLOSED_MAX_MS);
}
