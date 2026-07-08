import { NextResponse } from 'next/server';
import { adminToken } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  let password = '';
  try {
    password = (await req.json())?.password ?? '';
  } catch {
    /* fall through to 401 */
  }
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }
  const res = new NextResponse(null, { status: 204 });
  res.headers.set(
    'Set-Cookie',
    `wn_admin=${adminToken()}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`
  );
  return res;
}
