import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { listAllReferrals } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const referrals = await listAllReferrals();
  const totalCredited = referrals.reduce((s, r) => s + (r.status === 'credited' ? r.bonusAmount : 0), 0);
  return NextResponse.json({ referrals, totalCredited });
}
