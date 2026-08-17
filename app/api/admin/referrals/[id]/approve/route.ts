import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { approveReferralCredit, getReferralById } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Admin sign-off for a referral held at `awaiting_approval` (only reachable when
 * REFERRAL_REQUIRE_APPROVAL=true). Idempotent — approving an already-credited
 * referral is a no-op, not an error.
 */
export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await props.params;
  const referralId = Number(id);
  if (!Number.isInteger(referralId) || referralId <= 0) {
    return NextResponse.json({ error: 'Invalid referral id' }, { status: 400 });
  }
  if (!(await getReferralById(referralId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await approveReferralCredit(referralId, 'admin');
  const referral = await getReferralById(referralId);
  return NextResponse.json({ ok: true, referral });
}
