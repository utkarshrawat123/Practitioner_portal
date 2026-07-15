import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Dummy scheduled job proving the cron mechanism works before Part 6 adds real
 * jobs (tier recalculation, lifecycle emails). Vercel Cron invokes this on the
 * schedule in vercel.json and, when CRON_SECRET is set, sends it as a Bearer
 * token — we reject anything else so the endpoint can't be triggered publicly.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
  }
  const firedAt = new Date().toISOString();
  console.log(`[cron] heartbeat fired at ${firedAt}`);
  return NextResponse.json({ ok: true, firedAt });
}
