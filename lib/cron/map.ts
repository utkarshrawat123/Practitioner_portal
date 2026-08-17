/**
 * Maps a Cloudflare Cron Trigger expression (from `wrangler.toml` [triggers])
 * to the internal HTTP route that runs that job. Mirrors the schedules that
 * were in `vercel.json`. Kept separate from the Worker entry so it can be
 * unit-tested without importing the built Worker.
 */
export const CRON_MAP: Record<string, string> = {
  '0 6 * * *': '/api/cron/run', // daily automation: tiers, re-engagement, quarterly report
  '0 7 * * *': '/api/cron/chat-alerts', // daily missed-message alerts
};

export function cronPathFor(cron: string): string | null {
  return CRON_MAP[cron] ?? null;
}
