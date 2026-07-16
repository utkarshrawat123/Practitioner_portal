import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-auto-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  delete process.env.GMAIL_USER; delete process.env.GMAIL_APP_PASSWORD; // mock email
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});
async function approved(email: string, code: string) {
  const db = await import('@/lib/db');
  const p = await db.insertApplication({ name: 'Jane Smith', email, registerBody: 'BANT', registerNumber: email, qualificationStatus: 'qualified' });
  return db.markApproved(p.id, { affiliateCode: code, affiliateLink: 'x', pendingSync: false, decidedBy: 'system' });
}
async function order(code: string, total: number, when: string) {
  const db = await import('@/lib/db');
  await db.recordOrder({ orderId: `${code}-${total}-${when}`, practitionerId: null, code, total, currency: 'GBP', financialStatus: 'paid', createdAt: when });
}

describe('engagement scoring extension', () => {
  it('events + community add to the score', async () => {
    const { engagementScore } = await import('@/lib/reporting/scoring');
    const base = engagementScore({ logins30: 0, clicks30: 0, lessonsCompleted: 0, aiQueries30: 0 });
    const withExtra = engagementScore({ logins30: 0, clicks30: 0, lessonsCompleted: 0, aiQueries30: 0, eventsAttended: 2, communityActivity: 3 });
    expect(base).toBe(0);
    expect(withExtra).toBe(2 * 6 + 3 * 4);
  });
});

describe('tiering', () => {
  it('records tier, upgrades trigger recognition, and is idempotent', async () => {
    const db = await import('@/lib/db');
    const p = await approved('gold@example.com', 'WN-GOLD');
    const now = new Date();
    const recent = new Date(Date.now() - 5 * 86400000).toISOString();

    const { recalculateTiers } = await import('@/lib/automation/tiering');
    // First run: revenue 0 → standard recorded, no recognition (no prior tier).
    let r = await recalculateTiers(now);
    expect(r.changes).toBe(1);
    expect(await db.latestTier(p.id)).toBe('standard');
    expect(r.recognitionsSent).toBe(0);

    // Re-run unchanged → idempotent, no new history.
    r = await recalculateTiers(now);
    expect(r.changes).toBe(0);
    expect(await db.listTierHistory(p.id)).toHaveLength(1);

    // Add £3,000+ revenue → gold upgrade → recognition email sent once.
    await order('WN-GOLD', 3500, recent);
    r = await recalculateTiers(now);
    expect(await db.latestTier(p.id)).toBe('gold');
    expect(r.recognitionsSent).toBe(1);
    expect(await db.hasEmailBeenSent(p.id, 'recognition', `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`)).toBe(true);
  });
});

describe('lifecycle re-engagement', () => {
  it('emails dormant practitioners once per month (deduped)', async () => {
    const p = await approved('dormant@example.com', 'WN-DORM'); // no orders → dormant (no referral)
    const { runReEngagement } = await import('@/lib/automation/lifecycle');
    const first = await runReEngagement(new Date());
    expect(first.matched).toBe(1);
    expect(first.sent).toBe(1);
    const second = await runReEngagement(new Date());
    expect(second.sent).toBe(0); // deduped by period
    const db = await import('@/lib/db');
    expect(await db.recentEmailLog()).toHaveLength(1);
    void p;
  });
});

describe('dispatcher', () => {
  it('runs tiering + re-engagement and records automation runs', async () => {
    await approved('a@example.com', 'WN-A');
    const { runScheduledJobs } = await import('@/lib/automation/dispatcher');
    const results = await runScheduledJobs(new Date(), { includeQuarterly: true });
    expect(results.tiering).toBeDefined();
    expect(results.re_engagement).toBeDefined();
    expect(results.quarterly).toBeDefined();
    const db = await import('@/lib/db');
    const runs = await db.latestAutomationRuns();
    expect(runs.map((x) => x.job).sort()).toEqual(['quarterly', 're_engagement', 'tiering']);
  });
});
