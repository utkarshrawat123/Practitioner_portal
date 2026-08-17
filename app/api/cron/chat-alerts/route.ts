import { NextResponse } from 'next/server';
import { sendChatAlerts } from '@/lib/chat/alerts';

export const dynamic = 'force-dynamic';

/**
 * Missed-message backstop. A Cloudflare Cron Trigger hits this (schedules live in
 * `wrangler.toml [triggers]`, routed by `lib/cron/map.ts` via `worker.ts scheduled()`);
 * Bearer-guarded by CRON_SECRET so it can't be triggered publicly. Emails the
 * admin once per conversation that has waited past the threshold unanswered.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const result = await sendChatAlerts();
  console.log(`[cron] chat-alerts: checked=${result.checked} alerted=${result.alerted}`);
  return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() });
}
