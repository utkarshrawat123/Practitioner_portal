import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-presence-api-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'test-admin-pw';
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved(email = 'p@example.com', name = 'Pat One') {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name, email, registerBody: 'BANT', registerNumber: '12345', qualificationStatus: 'qualified',
  });
  const code = `WN-${p.id}-AB2C`;
  await markApproved(p.id, {
    affiliateCode: code, affiliateLink: `http://x/r/${code}`, pendingSync: false, decidedBy: 'system',
  });
  return p;
}
async function pHeaders(id: number) {
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return { cookie: sessionCookieHeader(id).split(';')[0], 'Content-Type': 'application/json' };
}
async function adminHeaders() {
  const { adminToken } = await import('@/lib/adminAuth');
  return { cookie: `wn_admin=${adminToken()}`, 'Content-Type': 'application/json' };
}

describe('presence API', () => {
  it('POST /api/me/presence 401 without a session', async () => {
    const { POST } = await import('@/app/api/me/presence/route');
    const res = await POST(new Request('http://x/api/me/presence', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('POST /api/me/presence touches the row and admin sees them online', async () => {
    const p = await seedApproved();
    const { POST } = await import('@/app/api/me/presence/route');
    const beat = await POST(new Request('http://x/api/me/presence', { method: 'POST', headers: await pHeaders(p.id) }));
    expect(beat.status).toBe(204);

    const { GET } = await import('@/app/api/admin/presence/route');
    const res = await GET(new Request('http://x/api/admin/presence', { headers: await adminHeaders() }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(1);
    expect(data.online.map((o: { id: number }) => o.id)).toContain(p.id);
  });

  it('GET /api/admin/presence 401 without admin auth', async () => {
    const { GET } = await import('@/app/api/admin/presence/route');
    const res = await GET(new Request('http://x/api/admin/presence'));
    expect(res.status).toBe(401);
  });
});
