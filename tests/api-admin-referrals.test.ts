import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-admin-referrals-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'test-admin';
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

it('401s without the admin cookie', async () => {
  const { GET } = await import('@/app/api/admin/referrals/route');
  const res = await GET(new Request('http://localhost/api/admin/referrals'));
  expect(res.status).toBe(401);
});

it('returns referrals + total for an authed admin', async () => {
  const hash = crypto.createHash('sha256').update('test-admin').digest('hex');
  const { GET } = await import('@/app/api/admin/referrals/route');
  const res = await GET(new Request('http://localhost/api/admin/referrals', { headers: { cookie: `wn_admin=${hash}` } }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('referrals');
  expect(body).toHaveProperty('totalCredited');
});
