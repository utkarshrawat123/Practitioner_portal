import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { del } from '@vercel/blob';
import { deleteObjects } from '@/lib/storage';

// The media DELETE route now deletes via lib/storage (R2/local); the cleanup
// route still uses Vercel Blob del(). Mock both so neither hits the network.
vi.mock('@vercel/blob', () => ({ del: vi.fn(async () => {}) }));
vi.mock('@/lib/storage', () => ({ deleteObjects: vi.fn(async () => {}) }));

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-apimedia-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'pw';
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function adminCookie(): Promise<string> {
  const { adminToken } = await import('@/lib/adminAuth');
  return `wn_admin=${adminToken()}`;
}

const payload = {
  title: 'Guide', type: 'document', description: 'x',
  contentKind: 'file', url: 'https://blob/x.pdf', pathname: 'media/x.pdf',
  thumbnailUrl: 'https://blob/t.png', thumbnailPathname: 'thumbnails/t.png', size: 10,
};

describe('/api/admin/media', () => {
  it('401s without the admin cookie', async () => {
    const { GET } = await import('@/app/api/admin/media/route');
    const res = await GET(new Request('http://x/api/admin/media'));
    expect(res.status).toBe(401);
  });

  it('saves and lists media with the cookie', async () => {
    const cookie = await adminCookie();
    const { POST, GET } = await import('@/app/api/admin/media/route');
    const post = await POST(new Request('http://x/api/admin/media', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(payload),
    }));
    expect(post.status).toBe(201);
    const list = await GET(new Request('http://x/api/admin/media', { headers: { cookie } }));
    expect(list.status).toBe(200);
    expect((await list.json()).media).toHaveLength(1);
  });

  it('rejects an invalid type', async () => {
    const cookie = await adminCookie();
    const { POST } = await import('@/app/api/admin/media/route');
    const res = await POST(new Request('http://x/api/admin/media', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ ...payload, type: 'bogus' }),
    }));
    expect(res.status).toBe(400);
  });

  it('resolves a YouTube thumbnail via the thumbnail route', async () => {
    const cookie = await adminCookie();
    const { GET } = await import('@/app/api/admin/media/thumbnail/route');
    const res = await GET(new Request('http://x/api/admin/media/thumbnail?url=' + encodeURIComponent('https://youtu.be/abc123XYZ_-'), { headers: { cookie } }));
    expect((await res.json()).thumbnailUrl).toBe('https://img.youtube.com/vi/abc123XYZ_-/hqdefault.jpg');
  });

  it('toggles published and deletes', async () => {
    const cookie = await adminCookie();
    const { POST } = await import('@/app/api/admin/media/route');
    await POST(new Request('http://x/api/admin/media', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(payload),
    }));
    const mod = await import('@/app/api/admin/media/[id]/route');
    const patch = await mod.PATCH(
      new Request('http://x/api/admin/media/1', { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ published: false }) }),
      { params: { id: '1' } }
    );
    expect((await patch.json()).media.published).toBe(false);
    const deleteRes = await mod.DELETE(
      new Request('http://x/api/admin/media/1', { method: 'DELETE', headers: { cookie } }),
      { params: { id: '1' } }
    );
    expect(deleteRes.status).toBe(200);
    expect(deleteObjects).toHaveBeenCalledWith(['media/x.pdf', 'thumbnails/t.png']);
    expect(await (await import('@/lib/db')).getMedia(1)).toBeNull();
  });

  it('cleanup deletes orphaned blob urls with the cookie', async () => {
    const cookie = await adminCookie();
    const { POST } = await import('@/app/api/admin/media/cleanup/route');
    const res = await POST(new Request('http://x/api/admin/media/cleanup', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ urls: ['https://blob/orphan.pdf', 'https://blob/orphan-thumb.png'] }),
    }));
    expect(res.status).toBe(200);
    expect(del).toHaveBeenCalledWith(['https://blob/orphan.pdf', 'https://blob/orphan-thumb.png']);
  });

  it('cleanup 401s without the admin cookie', async () => {
    const { POST } = await import('@/app/api/admin/media/cleanup/route');
    const res = await POST(new Request('http://x/api/admin/media/cleanup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ['https://blob/orphan.pdf'] }),
    }));
    expect(res.status).toBe(401);
  });

  it('cleanup rejects an empty url list', async () => {
    const cookie = await adminCookie();
    const { POST } = await import('@/app/api/admin/media/cleanup/route');
    const res = await POST(new Request('http://x/api/admin/media/cleanup', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ urls: [] }),
    }));
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-numeric id without throwing', async () => {
    const cookie = await adminCookie();
    const mod = await import('@/app/api/admin/media/[id]/route');
    const res = await mod.DELETE(
      new Request('http://x/api/admin/media/abc', { method: 'DELETE', headers: { cookie } }),
      { params: { id: 'abc' } }
    );
    expect(res.status).toBe(404);
  });
});
