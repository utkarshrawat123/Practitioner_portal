import { listPractitioners } from '@/lib/db';
import {
  computeTier,
  engagementScore,
  isChurnRisk,
  isDormant,
  markPowerUsers,
  type TierSlug,
} from '@/lib/reporting/scoring';
import {
  gatherSignals,
  getReferralDataProvider,
  type ReferralDataProvider,
} from '@/lib/reporting/signals';

export interface ReportRow {
  id: number;
  name: string;
  email: string;
  status: string;
  tier: TierSlug;
  referredRevenue: number;
  orders: number;
  clicks: number;
  conversionRate: number;
  engagementScore: number;
  lessonsCompleted: number;
  lastLoginAt: string | null;
  lastReferralAt: string | null;
  dormant: boolean;
  churnRisk: boolean;
  powerUser: boolean;
  dataWarning: boolean;
}

export interface ReportSummary {
  total: number;
  powerUsers: number;
  churnRisk: number;
  dormant: number;
  byTier: { standard: number; silver: number; gold: number };
}

export interface Report {
  rows: ReportRow[];
  summary: ReportSummary;
  generatedAt: string;
}

const CACHE_TTL_MS = 5 * 60_000;
let cache: { at: number; report: Report } | null = null;

export function clearReportCacheForTests(): void {
  cache = null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function buildReport(
  provider: ReferralDataProvider = getReferralDataProvider()
): Promise<Report> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.report;

  const now = new Date();
  const practitioners = listPractitioners();
  const rows: ReportRow[] = [];

  for (const p of practitioners) {
    const s = await gatherSignals(p, provider);
    rows.push({
      id: p.id,
      name: p.name,
      email: p.email,
      status: p.status,
      tier: computeTier(s.referral.revenue12mo),
      referredRevenue: round2(s.referral.revenue12mo),
      orders: s.referral.orders12mo,
      clicks: s.clicks.total,
      conversionRate:
        s.clicks.total > 0 ? Math.round((s.referral.orders12mo / s.clicks.total) * 1000) / 10 : 0,
      engagementScore: engagementScore({
        logins30: s.logins.last30,
        clicks30: s.clicks.last30,
        lessonsCompleted: s.lessonsCompleted,
        aiQueries30: s.aiQueries30,
      }),
      lessonsCompleted: s.lessonsCompleted,
      lastLoginAt: s.logins.lastAt,
      lastReferralAt: s.referral.lastReferralAt,
      dormant: isDormant(s.referral.lastReferralAt, now),
      churnRisk: isChurnRisk(
        {
          status: p.status,
          lastReferralAt: s.referral.lastReferralAt,
          logins30: s.logins.last30,
          clicks30: s.clicks.last30,
          loginsPrior30: s.logins.prior30,
          clicksPrior30: s.clicks.prior30,
        },
        now
      ),
      powerUser: false,
      dataWarning: s.dataWarning,
    });
  }

  markPowerUsers(rows);

  const summary: ReportSummary = {
    total: rows.length,
    powerUsers: rows.filter((r) => r.powerUser).length,
    churnRisk: rows.filter((r) => r.churnRisk).length,
    dormant: rows.filter((r) => r.dormant).length,
    byTier: {
      standard: rows.filter((r) => r.tier === 'standard').length,
      silver: rows.filter((r) => r.tier === 'silver').length,
      gold: rows.filter((r) => r.tier === 'gold').length,
    },
  };

  const report: Report = { rows, summary, generatedAt: now.toISOString() };
  cache = { at: Date.now(), report };
  return report;
}
