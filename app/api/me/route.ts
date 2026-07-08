import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { referralLink } from '@/lib/codes';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const p = getSessionPractitioner(req);
  if (!p || p.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  return NextResponse.json({
    practitioner: {
      name: p.name,
      email: p.email,
      registerBody: p.registerBody,
      registerNumber: p.registerNumber,
      qualificationStatus: p.qualificationStatus,
      tier: p.tier,
      createdAt: p.createdAt,
    },
    code: p.affiliateCode,
    link: p.affiliateCode ? referralLink(p.affiliateCode) : null,
  });
}
