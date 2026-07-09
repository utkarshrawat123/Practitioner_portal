import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { listAiQueries } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  return NextResponse.json({ queries: await listAiQueries() });
}
