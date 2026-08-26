import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-api-notif-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.SESSION_SECRET = 'test-secret';
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function approved(email: string) {
  const { insertApplication, execForTests } = await import('@/lib/db');
  const p = await insertApplication({
    name: 'Api Notif', email, registerBody: 'BANT',
    registerNumber: '333', qualificationStatus: 'qualified',
  });
  await execForTests(`UPDATE practitioners SET status = 'approved' WHERE id = ?`, [p.id]);
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return { id: p.id, cookie: sessionCookieHeader(p.id).split(';')[0] };
}

function req(url: string, method: string, cookie?: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('GET /api/me/notifications', () => {
  it('401s without a session', async () => {
    const { GET } = await import('@/app/api/me/notifications/route');
    expect((await GET(req('http://x/api/me/notifications', 'GET'))).status).toBe(401);
  });

  it('returns items and an unread count', async () => {
    const me = await approved('g1@example.com');
    const { notifyPractitioners } = await import('@/lib/db');
    await notifyPractitioners([me.id], { kind: 'content', title: 'New lesson', href: '/library' });

    const { GET } = await import('@/app/api/me/notifications/route');
    const body = await (await GET(req('http://x/api/me/notifications', 'GET', me.cookie))).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].title).toBe('New lesson');
    expect(body.unread).toBe(1);
  });
});

describe('POST /api/me/notifications/read', () => {
  it('401s without a session', async () => {
    const { POST } = await import('@/app/api/me/notifications/read/route');
    expect((await POST(req('http://x/api/me/notifications/read', 'POST'))).status).toBe(401);
  });

  it('marks everything read', async () => {
    const me = await approved('g2@example.com');
    const { notifyPractitioners } = await import('@/lib/db');
    await notifyPractitioners([me.id], { kind: 'content', title: 'One' });
    await notifyPractitioners([me.id], { kind: 'content', title: 'Two' });

    const { POST } = await import('@/app/api/me/notifications/read/route');
    await POST(req('http://x/api/me/notifications/read', 'POST', me.cookie));

    const { GET } = await import('@/app/api/me/notifications/route');
    const body = await (await GET(req('http://x/api/me/notifications', 'GET', me.cookie))).json();
    expect(body.unread).toBe(0);
  });

  it('cannot clear another practitioner’s notifications', async () => {
    const me = await approved('g3@example.com');
    const other = await approved('g4@example.com');
    const { notifyPractitioners, unreadNotificationCount } = await import('@/lib/db');
    await notifyPractitioners([other.id], { kind: 'content', title: 'Theirs' });

    const { POST } = await import('@/app/api/me/notifications/read/route');
    await POST(req('http://x/api/me/notifications/read', 'POST', me.cookie));

    // The other practitioner's row is untouched — the id comes from the
    // session, never from the request.
    expect(await unreadNotificationCount(other.id)).toBe(1);
  });
});
