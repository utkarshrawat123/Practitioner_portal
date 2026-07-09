import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { buildReport } from '@/lib/reporting/report';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const report = await buildReport();
  return NextResponse.json({
    rows: report.rows,
    summary: report.summary,
    generatedAt: report.generatedAt,
  });
}
