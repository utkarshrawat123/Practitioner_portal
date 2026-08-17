import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { getLesson, toggleCompletion } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  const practitioner = await getSessionPractitioner(req);
  if (!practitioner || practitioner.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const id = Number(params.id);
  const lesson = await getLesson(id);
  if (!lesson || lesson.status !== 'published') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const completed = await toggleCompletion(practitioner.id, id);
  return NextResponse.json({ completed });
}
