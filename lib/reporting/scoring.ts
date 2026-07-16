export type TierSlug = 'standard' | 'silver' | 'gold';

/** Every tunable number for the reporting model lives here. */
export const SCORING = {
  tiers: [
    { slug: 'gold' as const, min: 3000 },
    { slug: 'silver' as const, min: 1000 },
    { slug: 'standard' as const, min: 0 },
  ],
  engagement: { loginWeight: 10, clickWeight: 3, lessonWeight: 5, aiWeight: 4, eventWeight: 6, communityWeight: 4, cap: 100 },
  dormantDays: 90,
  churnDays: 60,
  powerUserPercentile: 0.2,
};

export function computeTier(revenue: number): TierSlug {
  for (const tier of SCORING.tiers) {
    if (revenue >= tier.min) return tier.slug;
  }
  return 'standard';
}

export function engagementScore(i: {
  logins30: number;
  clicks30: number;
  lessonsCompleted: number;
  aiQueries30: number;
  eventsAttended?: number;
  communityActivity?: number;
}): number {
  const { loginWeight, clickWeight, lessonWeight, aiWeight, eventWeight, communityWeight, cap } = SCORING.engagement;
  const raw =
    i.logins30 * loginWeight +
    i.clicks30 * clickWeight +
    i.lessonsCompleted * lessonWeight +
    i.aiQueries30 * aiWeight +
    (i.eventsAttended ?? 0) * eventWeight +
    (i.communityActivity ?? 0) * communityWeight;
  return Math.min(cap, raw);
}

function daysSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 86400000;
}

export function isDormant(lastReferralAt: string | null, now: Date = new Date()): boolean {
  if (!lastReferralAt) return true;
  return daysSince(lastReferralAt, now) > SCORING.dormantDays;
}

export function isChurnRisk(
  i: {
    status: string;
    lastReferralAt: string | null;
    logins30: number;
    clicks30: number;
    loginsPrior30: number;
    clicksPrior30: number;
  },
  now: Date = new Date()
): boolean {
  if (i.status !== 'approved') return false;
  const noReferralInWindow =
    !i.lastReferralAt || daysSince(i.lastReferralAt, now) > SCORING.churnDays;
  const recent = i.logins30 + i.clicks30;
  const prior = i.loginsPrior30 + i.clicksPrior30;
  const fallingActivity = recent < prior;
  return noReferralInWindow && fallingActivity;
}

/** Flags the top `powerUserPercentile` of rows by revenue (excluding zero-revenue). Mutates in place. */
export function markPowerUsers<T extends { referredRevenue: number; powerUser: boolean }>(
  rows: T[]
): void {
  const n = rows.length;
  if (n === 0) return;
  const k = Math.ceil(n * SCORING.powerUserPercentile);
  const ranked = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.referredRevenue - a.row.referredRevenue || a.index - b.index);
  for (let i = 0; i < k && i < ranked.length; i++) {
    if (ranked[i].row.referredRevenue > 0) ranked[i].row.powerUser = true;
  }
}
