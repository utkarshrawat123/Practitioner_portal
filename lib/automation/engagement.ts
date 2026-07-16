import {
  type Practitioner,
  loginStats, clickWindows, countCompletions, aiQueryCount30, eventsAttendedCount, communityActivityCount,
} from '@/lib/db';
import { engagementScore } from '@/lib/reporting/scoring';

/** Full engagement score including events + community participation (Part 6). */
export async function practitionerEngagement(p: Practitioner): Promise<number> {
  const [logins, clicks, lessons, ai, events, community] = await Promise.all([
    loginStats(p.id), clickWindows(p.id), countCompletions(p.id),
    aiQueryCount30(p.id), eventsAttendedCount(p.id), communityActivityCount(p.id),
  ]);
  return engagementScore({
    logins30: logins.last30, clicks30: clicks.last30, lessonsCompleted: lessons,
    aiQueries30: ai, eventsAttended: events, communityActivity: community,
  });
}
