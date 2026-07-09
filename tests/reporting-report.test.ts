import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ReferralDataProvider } from '@/lib/reporting/signals';

let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-report-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  (await import('@/lib/reporting/report')).clearReportCacheForTests();
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seed(name: string, email: string, code: string) {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name, email, registerBody: 'BANT', registerNumber: code, qualificationStatus: 'qualified',
  });
  return markApproved(p.id, {
    affiliateCode: code, affiliateLink: `http://x/r/${code}`, pendingSync: false, decidedBy: 'system',
  });
}

const providerFor = (byCode: Record<string, number>): ReferralDataProvider => ({
  name: 'fake',
  async getReferralData(code) {
    return { revenue12mo: byCode[code] ?? 0, orders12mo: byCode[code] ? 4 : 0, lastReferralAt: null };
  },
});

describe('buildReport', () => {
  it('builds rows with tier, revenue and conversion, and a summary', async () => {
    const a = await seed('Alice Gold', 'a@x.com', 'WN-A-1');
    await seed('Bob Standard', 'b@x.com', 'WN-B-2');
    const { recordClick, toggleCompletion, insertLesson, setLessonStatus, recordLogin } =
      await import('@/lib/db');
    // give Alice clicks + a completed lesson + logins for engagement
    recordClick(a.id, 'WN-A-1');
    recordClick(a.id, 'WN-A-1');
    recordLogin(a.id);
    const lessonId = await insertLesson({
      sourceFile: 's', title: 'L', summary: 's', takeaways: ['a', 'b', 'c'],
      quiz: { question: 'q', options: ['x', 'y'], correctIndex: 0, explanation: 'e' },
      topics: ['sleep'], claimFlags: [],
    });
    await setLessonStatus(lessonId, "published");
    await toggleCompletion(a.id, lessonId);

    const { buildReport } = await import('@/lib/reporting/report');
    const { rows, summary } = await buildReport(providerFor({ 'WN-A-1': 5000 }));

    const alice = rows.find((r) => r.email === 'a@x.com')!;
    expect(alice.tier).toBe('gold');
    expect(alice.referredRevenue).toBe(5000);
    expect(alice.orders).toBe(4);
    expect(alice.clicks).toBe(2);
    expect(alice.conversionRate).toBe(200); // 4 orders / 2 clicks
    expect(alice.lessonsCompleted).toBe(1);
    expect(alice.engagementScore).toBeGreaterThan(0);
    expect(alice.powerUser).toBe(true); // only revenue-bearing row, top 20%
    expect(alice.dormant).toBe(true); // lastReferralAt null

    const bob = rows.find((r) => r.email === 'b@x.com')!;
    expect(bob.tier).toBe('standard');
    expect(bob.powerUser).toBe(false);

    expect(summary.total).toBe(2);
    expect(summary.powerUsers).toBe(1);
    expect(summary.byTier.gold).toBe(1);
    expect(summary.byTier.standard).toBe(1);
  });

  it('marks a row dataWarning when the provider throws, and continues', async () => {
    await seed('Alice', 'a@x.com', 'WN-A-1');
    await seed('Bob', 'b@x.com', 'WN-B-2');
    const flaky: ReferralDataProvider = {
      name: 'flaky',
      async getReferralData(code) {
        if (code === 'WN-A-1') throw new Error('shopify down');
        return { revenue12mo: 1500, orders12mo: 2, lastReferralAt: null };
      },
    };
    const { buildReport } = await import('@/lib/reporting/report');
    const { rows } = await buildReport(flaky);
    const alice = rows.find((r) => r.email === 'a@x.com')!;
    expect(alice.dataWarning).toBe(true);
    expect(alice.referredRevenue).toBe(0);
    const bob = rows.find((r) => r.email === 'b@x.com')!;
    expect(bob.dataWarning).toBe(false);
    expect(bob.tier).toBe('silver');
  });
});
