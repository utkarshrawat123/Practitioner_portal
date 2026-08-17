import { NextResponse } from 'next/server';
import { runScheduledJobs } from '@/lib/automation/dispatcher';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily scheduled entrypoint (Cloudflare Cron Trigger). Runs the due automation jobs:
 * tier recalculation, re-engagement emails, and — in the first days of a
 * quarter — the quarterly impact report. Bearer-guarded by CRON_SECRET.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const results = await runScheduledJobs(new Date());
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
}
