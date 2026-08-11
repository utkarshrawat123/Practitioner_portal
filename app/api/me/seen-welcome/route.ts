import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { markSeenWelcome } from '@/lib/db';
import { welcomeSeenCookieHeader } from '@/lib/welcomeGate';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  // Keep the permanent first-login flag for analytics/back-compat…
  await markSeenWelcome(p.id);
  // …but the per-login gate is the session cookie: set it so the takeover
  // doesn't replay while the practitioner navigates this login session.
  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', welcomeSeenCookieHeader());
  return res;
}
