import { describe, it, expect } from 'vitest';
import {
  computeTier,
  engagementScore,
  isDormant,
  isChurnRisk,
  markPowerUsers,
} from '@/lib/reporting/scoring';

const now = new Date('2026-07-09T00:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

describe('computeTier', () => {
  it('maps revenue to tiers at the boundaries', () => {
    expect(computeTier(0)).toBe('standard');
    expect(computeTier(999)).toBe('standard');
    expect(computeTier(1000)).toBe('silver');
    expect(computeTier(2999)).toBe('silver');
    expect(computeTier(3000)).toBe('gold');
    expect(computeTier(9999)).toBe('gold');
  });
});

describe('engagementScore', () => {
  it('is a weighted blend capped at 100', () => {
    expect(engagementScore({ logins30: 0, clicks30: 0, lessonsCompleted: 0, aiQueries30: 0 })).toBe(0);
    expect(engagementScore({ logins30: 2, clicks30: 3, lessonsCompleted: 1, aiQueries30: 1 }))
      .toBe(2 * 10 + 3 * 3 + 1 * 5 + 1 * 4); // 38
    expect(engagementScore({ logins30: 50, clicks30: 50, lessonsCompleted: 50, aiQueries30: 50 })).toBe(100);
  });
});

describe('isDormant', () => {
  it('is true past 90 days or with no referral, false within', () => {
    expect(isDormant(null, now)).toBe(true);
    expect(isDormant(daysAgo(91), now)).toBe(true);
    expect(isDormant(daysAgo(89), now)).toBe(false);
  });
});

describe('isChurnRisk', () => {
  const base = {
    status: 'approved', lastReferralAt: null,
    logins30: 0, clicks30: 0, loginsPrior30: 5, clicksPrior30: 5,
  };
  it('flags approved, no referral 60d, falling activity', () => {
    expect(isChurnRisk(base, now)).toBe(true);
  });
  it('does not flag rising activity', () => {
    expect(isChurnRisk({ ...base, logins30: 6, clicks30: 6 }, now)).toBe(false);
  });
  it('does not flag a recent referral', () => {
    expect(isChurnRisk({ ...base, lastReferralAt: daysAgo(30) }, now)).toBe(false);
  });
  it('does not flag a brand-new practitioner with no history', () => {
    expect(isChurnRisk({ ...base, loginsPrior30: 0, clicksPrior30: 0 }, now)).toBe(false);
  });
  it('only applies to approved practitioners', () => {
    expect(isChurnRisk({ ...base, status: 'flagged' }, now)).toBe(false);
  });
});

describe('markPowerUsers', () => {
  it('flags the top 20% by revenue, excluding zero-revenue rows', () => {
    const rows = [5000, 2000, 100, 0, 0].map((r) => ({ referredRevenue: r, powerUser: false }));
    markPowerUsers(rows);
    expect(rows.map((r) => r.powerUser)).toEqual([true, false, false, false, false]);
  });
  it('flags nobody when all revenue is zero', () => {
    const rows = [0, 0, 0].map((r) => ({ referredRevenue: r, powerUser: false }));
    markPowerUsers(rows);
    expect(rows.every((r) => !r.powerUser)).toBe(true);
  });
});
