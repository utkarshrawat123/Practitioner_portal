/**
 * Presence timing — the single source of truth for the online window and the
 * client heartbeat cadence. Kept dependency-free so it is safe to import into
 * both the server data layer (`lib/db.ts`) and the client `PresenceBeat` widget.
 */

/** A practitioner is "online" if seen within this many seconds. */
export const PRESENCE_WINDOW_SECONDS = 90;

/**
 * How often the browser announces presence while the tab is focused.
 * 40s (vs the window's 90s) keeps a live tab online even if one beat is missed,
 * while cutting presence writes by a third versus the old 30s cadence.
 */
export const PRESENCE_BEAT_MS = 40_000;
