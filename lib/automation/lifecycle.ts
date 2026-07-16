import { listPractitioners, loginStats, clickWindows, referralDataByCode, countCompletions } from '@/lib/db';
import { isChurnRisk, isDormant } from '@/lib/reporting/scoring';
import { monthPeriod, quarterPeriod } from './periods';
import { sendOnce } from './email';
import { reEngagementEmail, quarterlyEmail } from './templates';

async function referral(code: string | null) {
  return code ? referralDataByCode(code) : { revenue12mo: 0, orders12mo: 0, lastReferralAt: null };
}

/** Emails churn-risk / dormant practitioners a re-engagement nudge, once per month. */
export async function runReEngagement(now: Date = new Date()): Promise<{ sent: number; matched: number }> {
  const practitioners = await listPractitioners('approved');
  let sent = 0, matched = 0;
  for (const p of practitioners) {
    const [logins, clicks, ref] = await Promise.all([loginStats(p.id), clickWindows(p.id), referral(p.affiliateCode)]);
    const churn = isChurnRisk({ status: p.status, lastReferralAt: ref.lastReferralAt, logins30: logins.last30, clicks30: clicks.last30, loginsPrior30: logins.prior30, clicksPrior30: clicks.prior30 }, now);
    const dormant = isDormant(ref.lastReferralAt, now);
    if (!churn && !dormant) continue;
    matched++;
    const { subject, html } = reEngagementEmail(p);
    if ((await sendOnce(p, 're_engagement', monthPeriod(now), subject, html)) === 'sent') sent++;
  }
  return { sent, matched };
}

/** Sends each approved practitioner a quarterly impact summary, once per quarter. */
export async function runQuarterlyImpact(now: Date = new Date()): Promise<{ sent: number }> {
  const practitioners = await listPractitioners('approved');
  let sent = 0;
  for (const p of practitioners) {
    const ref = await referral(p.affiliateCode);
    const lessons = await countCompletions(p.id);
    const { subject, html } = quarterlyEmail(p, { orders: ref.orders12mo, lessons });
    if ((await sendOnce(p, 'quarterly', quarterPeriod(now), subject, html)) === 'sent') sent++;
  }
  return { sent };
}
