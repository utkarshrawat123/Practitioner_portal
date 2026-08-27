import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { listPractitioners, listReferralsAwaitingApproval, countPractitionersSince } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Days counted by the triage band's "new this week" figure. */
const SIGNUP_WINDOW_DAYS = 7;

/**
 * Counts for the admin landing's triage band.
 *
 * Deliberately does NOT serve unread chat: `AdminDashboard` already runs a
 * 2.5s poller that owns that number for the capture toast, and a second source
 * on a different cadence would let the band and the badge disagree.
 *
 * Only counts with a real queue behind them appear here. Content sections
 * (media, pearls, calendar, factory) have no queue in the data model, so they
 * get no figure rather than a decorative zero.
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const [flagged, awaitingApproval, newSignups] = await Promise.all([
    listPractitioners('flagged'),
    listReferralsAwaitingApproval(),
    countPractitionersSince(SIGNUP_WINDOW_DAYS),
  ]);

  return NextResponse.json({
    flaggedApplications: flagged.length,
    referralsAwaitingApproval: awaitingApproval.length,
    newPractitioners7d: newSignups,
  });
}
