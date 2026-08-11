import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { listPublishedToolkitResourcesFor } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const type = new URL(req.url).searchParams.get('type') ?? undefined;
  const resources = await listPublishedToolkitResourcesFor(p.qualificationStatus, type);
  return NextResponse.json({ resources });
}
