import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-mewidgets-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved(qualificationStatus: 'qualified' | 'student') {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name: 'Jane Smith', email: `${qualificationStatus}@example.com`, registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus,
  });
  return markApproved(p.id, {
    affiliateCode: 'WN-SMITH-AB2C', affiliateLink: 'http://localhost:3100/r/WN-SMITH-AB2C',
    pendingSync: false, decidedBy: 'system',
  });
}
async function sessionCookie(id: number): Promise<string> {
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return sessionCookieHeader(id).split(';')[0];
}

describe('/api/me/widgets', () => {
  it('401s without a session', async () => {
    const { GET } = await import('@/app/api/me/widgets/route');
    expect((await GET(new Request('http://x/api/me/widgets'))).status).toBe(401);
  });

  it('returns only audience-appropriate published widgets', async () => {
    const p = await seedApproved('student');
    const db = await import('@/lib/db');
    await db.createHomepageWidget({ title: 'Everyone', audience: 'all', position: 0 });
    await db.createHomepageWidget({ title: 'Qualified only', audience: 'qualified', position: 1 });
    await db.createHomepageWidget({ title: 'Student only', audience: 'student', position: 2 });
    const cookie = await sessionCookie(p.id);
    const { GET } = await import('@/app/api/me/widgets/route');
    const res = await GET(new Request('http://x/api/me/widgets', { headers: { cookie } }));
    expect(res.status).toBe(200);
    expect((await res.json()).widgets.map((w: { title: string }) => w.title)).toEqual(['Everyone', 'Student only']);
  });
});

describe('/api/me/seen-welcome', () => {
  it('sets the flag for the session practitioner', async () => {
    const p = await seedApproved('qualified');
    const cookie = await sessionCookie(p.id);
    const { POST } = await import('@/app/api/me/seen-welcome/route');
    const res = await POST(new Request('http://x/api/me/seen-welcome', { method: 'POST', headers: { cookie } }));
    expect(res.status).toBe(200);
    const { getPractitioner } = await import('@/lib/db');
    expect((await getPractitioner(p.id))!.hasSeenWelcome).toBe(true);
  });

  it('401s without a session', async () => {
    const { POST } = await import('@/app/api/me/seen-welcome/route');
    expect((await POST(new Request('http://x/api/me/seen-welcome', { method: 'POST' }))).status).toBe(401);
  });
});
