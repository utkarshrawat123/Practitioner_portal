/**
 * Custom Cloudflare Worker entry.
 *
 * OpenNext generates `.open-next/worker.js` (a default export with `fetch` plus
 * the Durable Object classes it registers). We wrap it here to add a
 * `scheduled()` handler so Cloudflare Cron Triggers can run the app's cron jobs.
 * `wrangler.toml` `main` points at this file; the `.open-next/worker.js` import
 * is resolved by Wrangler at build time, after `opennextjs-cloudflare build`.
 *
 * The scheduled handler dispatches by cron expression to the matching internal
 * route and calls the Worker's own fetch — so the request runs through the full
 * Next pipeline (Cloudflare request context, D1/R2 bindings) and is authorised
 * with the same CRON_SECRET the routes already check.
 */
// @ts-expect-error - resolved by Wrangler after the OpenNext build
import openNextWorker from './.open-next/worker.js';
// @ts-expect-error - resolved by Wrangler after the OpenNext build
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js';
import { cronPathFor } from './lib/cron/map';
import { captureException } from './lib/monitoring';

interface Env {
  PORTAL_URL?: string;
  CRON_SECRET?: string;
  [k: string]: unknown;
}

export default {
  // Top-level error monitoring: report, then rethrow so normal error handling
  // (Next's 500 page) is unchanged. No-ops without SENTRY_DSN.
  async fetch(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    try {
      return await openNextWorker.fetch(req, env, ctx);
    } catch (err) {
      ctx.waitUntil(captureException(err, { where: 'worker.fetch', path: new URL(req.url).pathname }));
      throw err;
    }
  },

  async scheduled(
    event: { cron: string },
    env: Env,
    ctx: { waitUntil(p: Promise<unknown>): void }
  ): Promise<void> {
    const path = cronPathFor(event.cron);
    if (!path) return;
    const base = env.PORTAL_URL || 'https://portal.internal';
    const req = new Request(`${base}${path}`, {
      headers: { authorization: `Bearer ${env.CRON_SECRET ?? ''}` },
    });
    ctx.waitUntil(
      openNextWorker.fetch(req, env, ctx).then(
        () => undefined,
        // A crashed cron is invisible without this — report and swallow
        // (Cloudflare retries on its own schedule).
        (err: unknown) => captureException(err, { where: 'worker.scheduled', cron: event.cron })
      )
    );
  },
};
