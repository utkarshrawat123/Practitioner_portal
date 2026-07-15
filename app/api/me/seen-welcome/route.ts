import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { markSeenWelcome } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  await markSeenWelcome(p.id);
  return NextResponse.json({ ok: true });
}
