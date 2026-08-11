import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set(
    'Set-Cookie',
    'wn_admin=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'
  );
  return res;
}
