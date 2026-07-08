import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { listPractitioners, type Status } from '@/lib/db';

export const dynamic = 'force-dynamic';

const STATUSES: Status[] = ['pending', 'approved', 'flagged', 'rejected'];

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const status = new URL(req.url).searchParams.get('status');
  const filter = STATUSES.includes(status as Status) ? (status as Status) : undefined;
  return NextResponse.json({ practitioners: listPractitioners(filter) });
}
