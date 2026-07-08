import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-dash-'));
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
    affiliateCode: 'WN-SMITH-AB2C',
    affiliateLink: 'http://localhost:3100/r/WN-SMITH-AB2C',
    pendingSync: false, decidedBy: 'system',
  });
}

describe('auth tokens', () => {
  it('creates a 64-char hex token and consumes it exactly once', async () => {
    const { createAuthToken, consumeAuthToken } = await import('@/lib/db');
    const p = await seedApproved();
    const token = createAuthToken(p.id);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(consumeAuthToken(token)).toBe(p.id);
    expect(consumeAuthToken(token)).toBeNull(); // single-use
  });

  it('rejects unknown and expired tokens', async () => {
    const { createAuthToken, consumeAuthToken, getDb } = await import('@/lib/db');
    const p = await seedApproved();
    expect(consumeAuthToken('deadbeef'.repeat(8))).toBeNull();
    const token = createAuthToken(p.id);
    getDb().prepare(`UPDATE auth_tokens SET expires_at = datetime('now', '-1 minute') WHERE token = ?`).run(token);
    expect(consumeAuthToken(token)).toBeNull();
  });
});

describe('clicks', () => {
  it('finds practitioner by code and counts clicks by month and all-time', async () => {
    const { findByCode, recordClick, clickStats, getDb } = await import('@/lib/db');
    const p = await seedApproved();
    expect(findByCode('WN-SMITH-AB2C')?.id).toBe(p.id);
    expect(findByCode('WN-NOPE-XXXX')).toBeNull();
    recordClick(p.id, 'WN-SMITH-AB2C');
    recordClick(p.id, 'WN-SMITH-AB2C');
    // one click from a previous month
    getDb().prepare(
      `INSERT INTO clicks (practitioner_id, code, created_at) VALUES (?, ?, datetime('now', '-40 days'))`
    ).run(p.id, 'WN-SMITH-AB2C');
    expect(clickStats(p.id)).toEqual({ clicksThisMonth: 2, clicksAllTime: 3 });
  });
});
