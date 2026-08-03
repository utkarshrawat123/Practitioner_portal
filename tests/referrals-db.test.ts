import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-referrals-db-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

it('migration 017 creates practitioner_referrals with expected columns', async () => {
  const { execForTests } = await import('@/lib/db');
  const { rows } = await execForTests(`PRAGMA table_info(practitioner_referrals)`);
  const cols = (rows as any[]).map((r) => r.name);
  expect(cols).toEqual(
    expect.arrayContaining([
      'id', 'referrer_id', 'referred_id', 'referred_email', 'invite_code', 'status',
      'qualifying_order_id', 'bonus_amount', 'currency', 'signed_up_at', 'first_sale_at',
      'completed_at', 'credited_at', 'created_at',
    ])
  );
});
