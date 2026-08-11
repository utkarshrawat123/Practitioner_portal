import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { chatStats, practitionerChatMessages } from '@/lib/db';
import { topKeywords } from '@/lib/chat/keywords';

export const dynamic = 'force-dynamic';

function parseRange(url: URL) {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const pid = url.searchParams.get('practitionerId');
  return {
    from: from || null,
    to: to || null,
    practitionerId: pid ? Number(pid) : null,
  };
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Always-on (non-AI) chat analytics: volume, timing, top practitioners and
 * keyword frequency, over an optional [from,to] window. `?export=csv` streams
 * the raw practitioner messages instead, for offline analysis.
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const url = new URL(req.url);
  const range = parseRange(url);

  const msgs = await practitionerChatMessages({ from: range.from, to: range.to, limit: 5000 });

  if (url.searchParams.get('export') === 'csv') {
    const header = 'id,practitioner_id,created_at,body';
    const lines = msgs.map((m) =>
      [m.id, m.practitionerId, m.createdAt, csvEscape(m.body)].join(',')
    );
    const csv = [header, ...lines].join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="chat-messages.csv"',
      },
    });
  }

  const stats = await chatStats(range);
  const keywords = topKeywords(msgs.map((m) => m.body), 20);
  return NextResponse.json({ stats, keywords, sampleSize: msgs.length });
}
