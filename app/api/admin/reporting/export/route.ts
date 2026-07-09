import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { buildReport } from '@/lib/reporting/report';
import { toCsv } from '@/lib/reporting/csv';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const report = await buildReport();
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(report.rows), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="practitioner-report-${date}.csv"`,
    },
  });
}
