import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { getLesson, setLessonStatus, updateLessonFields } from '@/lib/db';

export const dynamic = 'force-dynamic';

const fieldsSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  takeaways: z.array(z.string()).min(1),
  quiz: z.object({
    question: z.string(),
    options: z.array(z.string()).min(2),
    correctIndex: z.number().int().min(0),
    explanation: z.string(),
  }),
  topics: z.array(z.string()).min(1),
});

export async function POST(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  if (!(await getLesson(id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }

  try {
    if (body.action === 'save') {
      const parsed = fieldsSchema.safeParse(body.fields);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid lesson fields' }, { status: 400 });
      }
      await updateLessonFields(id, parsed.data);
    } else if (body.action === 'approve') {
      await setLessonStatus(id, 'published');
    } else if (body.action === 'reject') {
      await setLessonStatus(id, 'rejected');
    } else {
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
    return NextResponse.json({ lesson: await getLesson(id) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
