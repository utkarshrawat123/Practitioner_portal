import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * The admin landing's triage band reads its figures from this one endpoint.
 * The band is the only place an admin sees "does anything need me?", so a wrong
 * count here is worse than no count — hence the boundary case below.
 */

let dir: string;
const cookie = () => `wn_admin=${crypto.createHash('sha256').update('test-admin').digest('hex')}`;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-admin-overview-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'test-admin';
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

const get = async (authed = true) => {
  const { GET } = await import('@/app/api/admin/overview/route');
  return GET(
    new Request('http://localhost/api/admin/overview', authed ? { headers: { cookie: cookie() } } : {})
  );
};

it('401s without the admin cookie', async () => {
  const res = await get(false);
  expect(res.status).toBe(401);
  expect((await res.json()).error).toBe('Unauthorised');
});

it('returns the three triage counts for an authed admin', async () => {
  const res = await get();
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('flaggedApplications');
  expect(body).toHaveProperty('referralsAwaitingApproval');
  expect(body).toHaveProperty('newPractitioners7d');
  // Unread chat is deliberately NOT served here — AdminDashboard's own 2.5s
  // poller owns that figure, and a second source would let the two disagree.
  expect(body).not.toHaveProperty('unreadChats');
});

it('counts flagged applications and ignores decided ones', async () => {
  const db = await import('@/lib/db');
  const flagged = await db.insertApplication({
    name: 'Flagged Practitioner', email: 'flagged@example.com',
    registerBody: 'BANT', registerNumber: '1', qualificationStatus: 'qualified',
  });
  await db.flagPractitioner(flagged.id, {
    reasonCode: 'PARTIAL_MATCH', confidence: 'low', detail: 'check', manualSearchUrl: 'https://example.com',
  });
  const approved = await db.insertApplication({
    name: 'Approved Practitioner', email: 'approved@example.com',
    registerBody: 'BANT', registerNumber: '2', qualificationStatus: 'qualified',
  });
  await db.markApproved(approved.id, {
    affiliateCode: 'AAA', affiliateLink: 'https://example.com/r/AAA',
    pendingSync: false, decidedBy: 'test',
  });

  const body = await (await get()).json();
  expect(body.flaggedApplications).toBe(1);
});

it('counts sign-ups inside the 7-day window and excludes older ones', async () => {
  const db = await import('@/lib/db');
  // Back-date via raw SQL: created_at defaults to datetime('now') on insert.
  await db.execForTests(
    `INSERT INTO practitioners (name, email, register_body, register_number, qualification_status, created_at)
     VALUES ('Six Days', 'six@example.com', 'BANT', '10', 'qualified', datetime('now', '-6 days'))`
  );
  await db.execForTests(
    `INSERT INTO practitioners (name, email, register_body, register_number, qualification_status, created_at)
     VALUES ('Eight Days', 'eight@example.com', 'BANT', '11', 'qualified', datetime('now', '-8 days'))`
  );

  const body = await (await get()).json();
  expect(body.newPractitioners7d).toBe(1);
});

it('counts referrals awaiting admin approval', async () => {
  const body = await (await get()).json();
  // No referrals seeded — the count must be a real 0, not undefined/NaN.
  expect(body.referralsAwaitingApproval).toBe(0);
});
