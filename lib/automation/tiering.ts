import { listPractitioners, referralDataByCode, latestTier, recordTier } from '@/lib/db';
import { computeTier } from '@/lib/reporting/scoring';
import { monthPeriod } from './periods';
import { sendOnce } from './email';
import { recognitionEmail } from './templates';

const RANK: Record<string, number> = { standard: 0, silver: 1, gold: 2 };

/**
 * Recalculates each approved practitioner's tier from rolling-12mo revenue and
 * records a tier_history row only when it changes (idempotent). On an *upgrade*
 * it sends a recognition email once per month.
 */
export async function recalculateTiers(now: Date = new Date()): Promise<{ processed: number; changes: number; recognitionsSent: number }> {
  const practitioners = await listPractitioners('approved');
  let changes = 0;
  let recognitionsSent = 0;
  for (const p of practitioners) {
    const revenue = p.affiliateCode ? (await referralDataByCode(p.affiliateCode)).revenue12mo : 0;
    const tier = computeTier(revenue);
    const prev = await latestTier(p.id);
    if (prev === tier) continue;
    await recordTier(p.id, tier);
    changes++;
    if (prev && RANK[tier] > RANK[prev]) {
      const { subject, html } = recognitionEmail(p, tier);
      if ((await sendOnce(p, 'recognition', monthPeriod(now), subject, html)) === 'sent') recognitionsSent++;
    }
  }
  return { processed: practitioners.length, changes, recognitionsSent };
}
