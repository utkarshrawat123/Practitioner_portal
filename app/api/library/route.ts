import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { completedLessonIds, listPublishedLessons } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const practitioner = getSessionPractitioner(req);
  if (!practitioner || practitioner.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const url = new URL(req.url);
  const topic = url.searchParams.get('topic') ?? undefined;
  const q = url.searchParams.get('q') ?? undefined;

  const lessons = listPublishedLessons({ topic, q }).map((l) => ({
    id: l.id,
    title: l.title,
    summary: l.summary,
    takeaways: l.takeaways,
    quiz: l.quiz,
    topics: l.topics,
    // claimFlags intentionally omitted — internal review data, not for practitioners.
  }));

  return NextResponse.json({
    lessons,
    completedIds: completedLessonIds(practitioner.id),
  });
}
