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
  const p = await insertApplication({
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
    const token = await createAuthToken(p.id);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(await consumeAuthToken(token)).toBe(p.id);
    expect(await consumeAuthToken(token)).toBeNull(); // single-use
  });

  it('rejects unknown and expired tokens', async () => {
    const { createAuthToken, consumeAuthToken, execForTests } = await import('@/lib/db');
    const p = await seedApproved();
    expect(await consumeAuthToken('deadbeef'.repeat(8))).toBeNull();
    const token = await createAuthToken(p.id);
    await execForTests(`UPDATE auth_tokens SET expires_at = datetime('now', '-1 minute') WHERE token = ?`, [token]);
    expect(await consumeAuthToken(token)).toBeNull();
  });
});

describe('clicks', () => {
  it('finds practitioner by code and counts clicks by month and all-time', async () => {
    const { findByCode, recordClick, clickStats, execForTests } = await import('@/lib/db');
    const p = await seedApproved();
    expect((await findByCode('WN-SMITH-AB2C'))?.id).toBe(p.id);
    expect(await findByCode('WN-NOPE-XXXX')).toBeNull();
    await recordClick(p.id, 'WN-SMITH-AB2C');
    await recordClick(p.id, 'WN-SMITH-AB2C');
    // one click from a previous month
    await execForTests(
      `INSERT INTO clicks (practitioner_id, code, created_at) VALUES (?, ?, datetime('now', '-40 days'))`,
      [p.id, 'WN-SMITH-AB2C']
    );
    expect(await clickStats(p.id)).toEqual({ clicksThisMonth: 2, clicksAllTime: 3 });
  });
});
