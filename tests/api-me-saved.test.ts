import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-api-saved-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.SESSION_SECRET = 'test-secret';
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function approvedCookie(email: string): Promise<string> {
  const { insertApplication, execForTests } = await import('@/lib/db');
  const p = await insertApplication({
    name: 'Api Saver', email, registerBody: 'BANT',
    registerNumber: '999', qualificationStatus: 'qualified',
  });
  await execForTests(`UPDATE practitioners SET status = 'approved' WHERE id = ?`, [p.id]);
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return sessionCookieHeader(p.id).split(';')[0];
}

function req(method: string, cookie?: string, body?: unknown): Request {
  return new Request('http://x/api/me/saved', {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('/api/me/saved', () => {
  it('401s without a session', async () => {
    const { GET } = await import('@/app/api/me/saved/route');
    expect((await GET(req('GET'))).status).toBe(401);
  });

  it('401s on POST without a session', async () => {
    const { POST } = await import('@/app/api/me/saved/route');
    expect((await POST(req('POST', undefined, { itemType: 'toolkit', itemId: 1 }))).status).toBe(401);
  });

  it('400s on an itemType outside the allowed three', async () => {
    const cookie = await approvedCookie('bad-type@example.com');
    const { POST } = await import('@/app/api/me/saved/route');
    const res = await POST(req('POST', cookie, { itemType: 'practitioners', itemId: 1 }));
    expect(res.status).toBe(400);
  });

  it('400s on a non-numeric itemId', async () => {
    const cookie = await approvedCookie('bad-id@example.com');
    const { POST } = await import('@/app/api/me/saved/route');
    expect((await POST(req('POST', cookie, { itemType: 'toolkit', itemId: 'abc' }))).status).toBe(400);
  });

  it('POST then GET reflects the save in refs', async () => {
    const cookie = await approvedCookie('roundtrip@example.com');
    const { GET, POST } = await import('@/app/api/me/saved/route');
    await POST(req('POST', cookie, { itemType: 'toolkit', itemId: 42 }));
    const body = await (await GET(req('GET', cookie))).json();
    expect(body.refs).toEqual([{ itemType: 'toolkit', itemId: 42 }]);
  });

  it('DELETE removes it again', async () => {
    const cookie = await approvedCookie('remove@example.com');
    const { GET, POST, DELETE } = await import('@/app/api/me/saved/route');
    await POST(req('POST', cookie, { itemType: 'lesson', itemId: 9 }));
    await DELETE(req('DELETE', cookie, { itemType: 'lesson', itemId: 9 }));
    const body = await (await GET(req('GET', cookie))).json();
    expect(body.refs).toEqual([]);
  });
});
