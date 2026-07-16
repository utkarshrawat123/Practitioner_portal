import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { listPublishedLessons, listPublishedMedia } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Published lessons + media the admin can attach as pathway modules. */
export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const lessons = (await listPublishedLessons()).map((l) => ({ id: l.id, title: l.title }));
  const media = (await listPublishedMedia()).map((m) => ({ id: m.id, title: m.title, type: m.type }));
  return NextResponse.json({ lessons, media });
}
