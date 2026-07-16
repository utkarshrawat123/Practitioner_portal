import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { latestAutomationRuns, recentEmailLog, listLeaderboardOptins } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const [runs, emails, optins] = await Promise.all([latestAutomationRuns(), recentEmailLog(50), listLeaderboardOptins()]);
  return NextResponse.json({ runs, emails, optins });
}
