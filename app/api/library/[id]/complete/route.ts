import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { getLesson, toggleCompletion } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const practitioner = getSessionPractitioner(req);
  if (!practitioner || practitioner.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const id = Number(params.id);
  const lesson = getLesson(id);
  if (!lesson || lesson.status !== 'published') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const completed = toggleCompletion(practitioner.id, id);
  return NextResponse.json({ completed });
}
