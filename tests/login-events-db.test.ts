import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-login-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved() {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = insertApplication({
    name: 'Jane Smith', email: 'jane@example.com', registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus: 'qualified',
  });
  return markApproved(p.id, {
    affiliateCode: 'WN-SMITH-AB2C', affiliateLink: 'http://localhost:3100/r/WN-SMITH-AB2C',
    pendingSync: false, decidedBy: 'system',
  });
}

describe('login events', () => {
  it('records logins and splits counts into 30-day windows', async () => {
    const { recordLogin, loginStats, getDb } = await import('@/lib/db');
    const p = await seedApproved();
    recordLogin(p.id);
    recordLogin(p.id);
    // one login 45 days ago → prior-30 window
    getDb().prepare(
      `INSERT INTO login_events (practitioner_id, created_at) VALUES (?, datetime('now','-45 days'))`
    ).run(p.id);
    const s = loginStats(p.id);
    expect(s.last30).toBe(2);
    expect(s.prior30).toBe(1);
    expect(s.lastAt).not.toBeNull();
  });

  it('splits clicks into windows and totals', async () => {
    const { recordClick, clickWindows, getDb } = await import('@/lib/db');
    const p = await seedApproved();
    recordClick(p.id, 'WN-SMITH-AB2C'); // now → last30
    getDb().prepare(
      `INSERT INTO clicks (practitioner_id, code, created_at) VALUES (?, ?, datetime('now','-45 days'))`
    ).run(p.id, 'WN-SMITH-AB2C');
    const w = clickWindows(p.id);
    expect(w.last30).toBe(1);
    expect(w.prior30).toBe(1);
    expect(w.total).toBe(2);
    expect(w.lastAt).not.toBeNull();
  });

  it('counts recent AI queries within the window', async () => {
    const { recordAiQuery, aiQueryCount, getDb } = await import('@/lib/db');
    const p = await seedApproved();
    recordAiQuery({ practitionerId: p.id, profileInput: 'x', status: 'ok', safetyFlags: [] });
    getDb().prepare(
      `INSERT INTO ai_queries (practitioner_id, profile_input, status, safety_flags, created_at)
       VALUES (?, 'y', 'ok', '[]', datetime('now','-45 days'))`
    ).run(p.id);
    expect(aiQueryCount(p.id, 30)).toBe(1);
    expect(aiQueryCount(p.id, 90)).toBe(2);
  });
});
