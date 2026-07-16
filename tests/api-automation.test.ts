import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-apiauto-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'pw';
  delete process.env.GMAIL_USER; delete process.env.GMAIL_APP_PASSWORD;
  process.env.CRON_SECRET = 'sekret';
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});
async function approved(email: string) {
  const db = await import('@/lib/db');
  const p = await db.insertApplication({ name: 'Jane Smith', email, registerBody: 'BANT', registerNumber: email, qualificationStatus: 'qualified' });
  return db.markApproved(p.id, { affiliateCode: `WN-${email}`, affiliateLink: 'x', pendingSync: false, decidedBy: 'system' });
}
async function cookie(id: number) {
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return sessionCookieHeader(id).split(';')[0];
}
async function adminCookie() {
  const { adminToken } = await import('@/lib/adminAuth');
  return `wn_admin=${adminToken()}`;
}

describe('cron run route', () => {
  it('401 without the Bearer secret; 200 with it', async () => {
    const { GET } = await import('@/app/api/cron/run/route');
    expect((await GET(new Request('http://x/'))).status).toBe(401);
    const ok = await GET(new Request('http://x/', { headers: { authorization: 'Bearer sekret' } }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).ok).toBe(true);
  });
});

describe('leaderboard', () => {
  it('opt-in then appears on the leaderboard', async () => {
    const p = await approved('lead@example.com');
    const c = await cookie(p.id);
    const { GET, POST } = await import('@/app/api/me/leaderboard/route');
    let body = await (await GET(new Request('http://x/', { headers: { cookie: c } }))).json();
    expect(body.leaderboard).toHaveLength(0);
    expect(body.optedIn).toBe(false);

    await POST(new Request('http://x/', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: c }, body: JSON.stringify({ optedIn: true, displayName: 'Jane S.' }) }));
    body = await (await GET(new Request('http://x/', { headers: { cookie: c } }))).json();
    expect(body.optedIn).toBe(true);
    expect(body.leaderboard).toHaveLength(1);
    expect(body.leaderboard[0].displayName).toBe('Jane S.');
    expect(body.leaderboard[0].isMe).toBe(true);
  });
});

describe('admin automation', () => {
  it('run then read runs + email log', async () => {
    await approved('a@example.com');
    const admin = await adminCookie();
    const { POST: run } = await import('@/app/api/admin/automation/run/route');
    expect((await run(new Request('http://x/', { method: 'POST', headers: { cookie: admin } }))).status).toBe(200);
    const { GET } = await import('@/app/api/admin/automation/route');
    const body = await (await GET(new Request('http://x/', { headers: { cookie: admin } }))).json();
    expect(body.runs.length).toBeGreaterThanOrEqual(2);
    expect((await (await GET(new Request('http://x/'))).status)).toBe(401);
  });
});
