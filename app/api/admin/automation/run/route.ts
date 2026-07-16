import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { runScheduledJobs } from '@/lib/automation/dispatcher';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Manual "run now" from the admin Automation tab (includes the quarterly job). */
export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const results = await runScheduledJobs(new Date(), { includeQuarterly: true });
  return NextResponse.json({ ok: true, results });
}
