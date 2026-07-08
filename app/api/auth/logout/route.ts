import { NextResponse } from 'next/server';
import { clearSessionCookieHeader } from '@/lib/practitionerAuth';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set('Set-Cookie', clearSessionCookieHeader());
  return res;
}
