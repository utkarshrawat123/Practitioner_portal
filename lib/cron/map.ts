/**
 * Maps a Cloudflare Cron Trigger expression (from `wrangler.toml` [triggers])
 * to the internal HTTP route that runs that job. Kept separate from the Worker
 * entry so it can be unit-tested without importing the built Worker.
 *
 * Adding a schedule means editing BOTH files: the trigger in `wrangler.toml`
 * and the mapping here. A trigger with no mapping fires and does nothing.
 */
export const CRON_MAP: Record<string, string> = {
  '0 6 * * *': '/api/cron/run', // daily automation: tiers, re-engagement, quarterly report
  '0 7 * * *': '/api/cron/chat-alerts', // daily missed-message alerts
};

export function cronPathFor(cron: string): string | null {
  return CRON_MAP[cron] ?? null;
}
