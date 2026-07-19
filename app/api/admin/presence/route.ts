import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { listOnlinePractitioners } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Currently-online practitioners for the admin "Live Now" view. */
export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const online = await listOnlinePractitioners();
  return NextResponse.json({ online, count: online.length });
}
