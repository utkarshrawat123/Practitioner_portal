import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-autodb-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});
async function seed(email = 'a@example.com') {
  const db = await import('@/lib/db');
  const p = await db.insertApplication({ name: 'Jane Smith', email, registerBody: 'BANT', registerNumber: email, qualificationStatus: 'qualified' });
  return db.markApproved(p.id, { affiliateCode: `WN-${email}`, affiliateLink: 'x', pendingSync: false, decidedBy: 'system' });
}

describe('automation db', () => {
  it('tier history records + latestTier', async () => {
    const db = await import('@/lib/db');
    const p = await seed();
    expect(await db.latestTier(p.id)).toBeNull();
    await db.recordTier(p.id, 'standard');
    await db.recordTier(p.id, 'silver');
    expect(await db.latestTier(p.id)).toBe('silver');
    expect(await db.listTierHistory(p.id)).toHaveLength(2);
  });

  it('leaderboard optin upsert + list', async () => {
    const db = await import('@/lib/db');
    const p = await seed();
    await db.setLeaderboardOptin(p.id, true, 'Jane S.');
    expect((await db.getLeaderboardOptin(p.id))!.optedIn).toBe(true);
    await db.setLeaderboardOptin(p.id, false, null);
    expect((await db.getLeaderboardOptin(p.id))!.optedIn).toBe(false);
    expect(await db.listLeaderboardOptins()).toHaveLength(0);
    await db.setLeaderboardOptin(p.id, true, 'Jane S.');
    expect(await db.listLeaderboardOptins()).toHaveLength(1);
  });

  it('email log dedupe + run log', async () => {
    const db = await import('@/lib/db');
    const p = await seed();
    expect(await db.hasEmailBeenSent(p.id, 'recognition', '2026-07')).toBe(false);
    await db.logEmailSent(p.id, 'recognition', '2026-07', 'tier up');
    await db.logEmailSent(p.id, 'recognition', '2026-07', 'dup');
    expect(await db.hasEmailBeenSent(p.id, 'recognition', '2026-07')).toBe(true);
    expect(await db.recentEmailLog()).toHaveLength(1);

    await db.recordAutomationRun('tiering', 'ok', 'recalced 1');
    await db.recordAutomationRun('tiering', 'ok', 'recalced 2');
    const latest = await db.latestAutomationRuns();
    expect(latest.find((r) => r.job === 'tiering')!.detail).toBe('recalced 2');
  });
});
