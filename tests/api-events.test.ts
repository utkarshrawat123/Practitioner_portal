import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-events-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'pw';
  delete process.env.GMAIL_USER; delete process.env.GMAIL_APP_PASSWORD; // force mock email
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});
async function adminCookie(): Promise<string> {
  const { adminToken } = await import('@/lib/adminAuth');
  return `wn_admin=${adminToken()}`;
}
async function approved() {
  const db = await import('@/lib/db');
  const p = await db.insertApplication({ name: 'Jane Smith', email: 'jane@example.com', registerBody: 'BANT', registerNumber: '1', qualificationStatus: 'qualified' });
  return db.markApproved(p.id, { affiliateCode: 'WN-J-1', affiliateLink: 'x', pendingSync: false, decidedBy: 'system' });
}
async function cookie(id: number): Promise<string> {
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return sessionCookieHeader(id).split(';')[0];
}

describe('ICS builder', () => {
  it('produces a valid VEVENT block', async () => {
    const { buildIcs } = await import('@/lib/events/ics');
    const ics = buildIcs({ id: 1, title: 'Webinar', description: 'x', startsAt: '2026-08-01T18:00:00Z', endsAt: null, location: null, eventType: 'online', capacity: null, audience: 'all', recordingUrl: null, published: true, createdAt: '' }, 'https://p');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:Webinar');
    expect(ics).toContain('DTSTART:20260801T180000Z');
    expect(ics).toContain('END:VCALENDAR');
  });
});

describe('events APIs', () => {
  it('admin creates, practitioner sees + registers (mock email) + capacity enforced', async () => {
    const admin = await adminCookie();
    const { POST } = await import('@/app/api/admin/events/route');
    const created = await POST(new Request('http://x/', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: admin }, body: JSON.stringify({ title: 'Gut webinar', startsAt: '2026-08-01T18:00:00Z', eventType: 'online', capacity: 1, published: true }) }));
    expect(created.status).toBe(201);
    const eid = (await created.json()).event.id as number;

    const p = await approved();
    const c = await cookie(p.id);
    const list = await (await import('@/app/api/me/events/route')).GET(new Request('http://x/', { headers: { cookie: c } }));
    const events = (await list.json()).events;
    expect(events).toHaveLength(1);
    expect(events[0].registered).toBe(false);
    expect(events[0].spotsLeft).toBe(1);

    const { POST: register } = await import('@/app/api/me/events/[id]/register/route');
    const reg = await register(new Request('http://x/', { method: 'POST', headers: { cookie: c } }), { params: { id: String(eid) } });
    expect(reg.status).toBe(200);
    expect((await reg.json()).emailed).toBe(true); // mock returns ok

    // Second practitioner cannot register — capacity 1 is full.
    const db = await import('@/lib/db');
    const p2 = await db.insertApplication({ name: 'Bob', email: 'bob@example.com', registerBody: 'BANT', registerNumber: '2', qualificationStatus: 'qualified' });
    await db.markApproved(p2.id, { affiliateCode: 'WN-B-2', affiliateLink: 'x', pendingSync: false, decidedBy: 'system' });
    const reg2 = await register(new Request('http://x/', { method: 'POST', headers: { cookie: await cookie(p2.id) } }), { params: { id: String(eid) } });
    expect(reg2.status).toBe(409);
  });

  it('401s without admin/session', async () => {
    const { GET: adminGet } = await import('@/app/api/admin/events/route');
    expect((await adminGet(new Request('http://x/'))).status).toBe(401);
    const { GET: meGet } = await import('@/app/api/me/events/route');
    expect((await meGet(new Request('http://x/'))).status).toBe(401);
  });
});
