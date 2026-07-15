import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-apiwidgets-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'pw';
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function adminCookie(): Promise<string> {
  const { adminToken } = await import('@/lib/adminAuth');
  return `wn_admin=${adminToken()}`;
}

describe('/api/admin/widgets', () => {
  it('401s without the admin cookie', async () => {
    const { GET } = await import('@/app/api/admin/widgets/route');
    expect((await GET(new Request('http://x/api/admin/widgets'))).status).toBe(401);
  });

  it('creates, lists, patches and deletes with the cookie', async () => {
    const cookie = await adminCookie();
    const { POST, GET } = await import('@/app/api/admin/widgets/route');
    const post = await POST(new Request('http://x/api/admin/widgets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ title: 'New webinar', body: 'Join us', audience: 'all', position: 0 }),
    }));
    expect(post.status).toBe(201);
    const id = (await post.json()).widget.id as number;

    const list = await GET(new Request('http://x/api/admin/widgets', { headers: { cookie } }));
    expect((await list.json()).widgets).toHaveLength(1);

    const { PATCH, DELETE } = await import('@/app/api/admin/widgets/[id]/route');
    const patched = await PATCH(
      new Request(`http://x/api/admin/widgets/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ published: false }),
      }),
      { params: { id: String(id) } }
    );
    expect((await patched.json()).widget.published).toBe(false);

    const del = await DELETE(
      new Request(`http://x/api/admin/widgets/${id}`, { method: 'DELETE', headers: { cookie } }),
      { params: { id: String(id) } }
    );
    expect((await del.json()).ok).toBe(true);
  });

  it('rejects an invalid body (missing title)', async () => {
    const cookie = await adminCookie();
    const { POST } = await import('@/app/api/admin/widgets/route');
    const res = await POST(new Request('http://x/api/admin/widgets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ body: 'no title' }),
    }));
    expect(res.status).toBe(400);
  });
});
