import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-api-referrals-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.SESSION_SECRET = 'test-secret';
  process.env.PORTAL_URL = 'http://localhost:3100';
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

it('401s without a session', async () => {
  const { GET } = await import('@/app/api/me/referrals/route');
  const res = await GET(new Request('http://localhost/api/me/referrals'));
  expect(res.status).toBe(401);
});

it('returns invite link + earnings + referrals for the signed-in practitioner', async () => {
  const db = await import('@/lib/db');
  const { insertApplication, markApproved } = db;
  const p = await insertApplication({ name: 'Me', email: 'me@example.com', registerBody: 'BANT', registerNumber: '1', qualificationStatus: 'qualified' });
  await markApproved(p.id, { affiliateCode: 'WN-ME-CODE', affiliateLink: 'http://x', pendingSync: false, decidedBy: 'system' });
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  const cookie = sessionCookieHeader(p.id).split(';')[0];

  const { GET } = await import('@/app/api/me/referrals/route');
  const res = await GET(new Request('http://localhost/api/me/referrals', { headers: { cookie } }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.inviteLink).toContain('ref=WN-ME-CODE');
  expect(body.earnings).toEqual({ creditedTotal: 0, pendingCount: 0 });
  expect(Array.isArray(body.referrals)).toBe(true);
});
