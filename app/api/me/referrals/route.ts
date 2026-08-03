import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { listReferralsByReferrer, referralEarnings } from '@/lib/db';
import { portalUrl } from '@/lib/codes';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const [referrals, earnings] = await Promise.all([
    listReferralsByReferrer(p.id),
    referralEarnings(p.id),
  ]);
  const inviteLink = `${portalUrl()}/apply?ref=${encodeURIComponent(p.affiliateCode ?? '')}`;
  return NextResponse.json({ inviteLink, earnings, referrals });
}
