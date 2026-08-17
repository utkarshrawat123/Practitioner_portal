import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import {
  listAllReferrals,
  listReferralsAwaitingApproval,
  referralRequiresApproval,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const referrals = await listAllReferrals();
  const totalCredited = referrals.reduce((s, r) => s + (r.status === 'credited' ? r.bonusAmount : 0), 0);
  return NextResponse.json({
    referrals,
    totalCredited,
    // v2: the approval queue is only non-empty when REFERRAL_REQUIRE_APPROVAL=true.
    awaitingApproval: await listReferralsAwaitingApproval(),
    requiresApproval: referralRequiresApproval(),
  });
}
