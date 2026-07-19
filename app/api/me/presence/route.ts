import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { touchPresence } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Presence heartbeat. The practitioner's browser POSTs this every ~30s while focused. */
export async function POST(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  await touchPresence(p.id);
  return new NextResponse(null, { status: 204 });
}
