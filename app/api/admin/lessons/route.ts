import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { listLessons } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const status = new URL(req.url).searchParams.get('status') ?? undefined;
  return NextResponse.json({ lessons: listLessons(status) });
}
