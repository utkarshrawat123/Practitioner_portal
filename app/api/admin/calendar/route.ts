import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import {
  listPathways, listToolkitResources, listHubEvents,
  listHomepageWidgets, listClinicalPearls, listLessons,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

interface CalendarItem {
  kind: 'pathway' | 'toolkit' | 'event' | 'widget' | 'pearl' | 'lesson';
  id: number;
  title: string;
  status: 'published' | 'draft';
  audience: string;
  date: string;
}

/** One planning surface across every content type. */
export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const [pathways, toolkit, events, widgets, pearls, lessons] = await Promise.all([
    listPathways(), listToolkitResources(), listHubEvents(),
    listHomepageWidgets(), listClinicalPearls(), listLessons(),
  ]);

  const items: CalendarItem[] = [
    ...pathways.map((p): CalendarItem => ({ kind: 'pathway', id: p.id, title: p.title, status: p.published ? 'published' : 'draft', audience: p.audience, date: p.createdAt })),
    ...toolkit.map((t): CalendarItem => ({ kind: 'toolkit', id: t.id, title: t.title, status: t.published ? 'published' : 'draft', audience: t.audience, date: t.createdAt })),
    ...events.map((e): CalendarItem => ({ kind: 'event', id: e.id, title: e.title, status: e.published ? 'published' : 'draft', audience: e.audience, date: e.startsAt })),
    ...widgets.map((w): CalendarItem => ({ kind: 'widget', id: w.id, title: w.title, status: w.published ? 'published' : 'draft', audience: w.audience, date: w.createdAt })),
    ...pearls.map((p): CalendarItem => ({ kind: 'pearl', id: p.id, title: p.body.slice(0, 60), status: p.status, audience: p.audience, date: p.createdAt })),
    ...lessons.map((l): CalendarItem => ({ kind: 'lesson', id: l.id, title: l.title, status: l.status === 'published' ? 'published' : 'draft', audience: 'all', date: l.createdAt })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return NextResponse.json({ items });
}
