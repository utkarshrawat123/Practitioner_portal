import { NextResponse } from 'next/server';
import { consumeAuthToken, recordLogin } from '@/lib/db';
import { portalUrl } from '@/lib/codes';
import { sessionCookieHeader } from '@/lib/practitionerAuth';
import { clearWelcomeCookieHeader } from '@/lib/welcomeGate';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const practitionerId = token ? await consumeAuthToken(token) : null;
  if (!practitionerId) {
    return NextResponse.redirect(`${portalUrl()}/dashboard?error=expired`, 302);
  }
  // Best-effort engagement signal — never block login on a logging failure.
  try {
    await recordLogin(practitionerId);
  } catch {
    /* ignore */
  }
  const res = NextResponse.redirect(`${portalUrl()}/dashboard`, 302);
  res.headers.set('Set-Cookie', sessionCookieHeader(practitionerId));
  // Clear the per-login welcome cookie so the takeover replays for this login.
  res.headers.append('Set-Cookie', clearWelcomeCookieHeader());
  return res;
}
