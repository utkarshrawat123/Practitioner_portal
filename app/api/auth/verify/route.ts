import { NextResponse } from 'next/server';
import { consumeAuthToken, recordLogin } from '@/lib/db';
import { portalUrl } from '@/lib/codes';
import { sessionCookieHeader } from '@/lib/practitionerAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const practitionerId = token ? consumeAuthToken(token) : null;
  if (!practitionerId) {
    return NextResponse.redirect(`${portalUrl()}/dashboard?error=expired`, 302);
  }
  // Best-effort engagement signal — never block login on a logging failure.
  try {
    recordLogin(practitionerId);
  } catch {
    /* ignore */
  }
  const res = NextResponse.redirect(`${portalUrl()}/dashboard`, 302);
  res.headers.set('Set-Cookie', sessionCookieHeader(practitionerId));
  return res;
}
