import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-apires-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('/api/resources', () => {
  it('401s without a session', async () => {
    const { GET } = await import('@/app/api/resources/route');
    const res = await GET(new Request('http://x/api/resources'));
    expect(res.status).toBe(401);
  });

  it('returns only published media for an approved practitioner', async () => {
    const db = await import('@/lib/db');
    const a = await db.createMedia({ title: 'Pub', type: 'document', description: null, contentKind: 'link', url: 'https://x/y', pathname: null, thumbnailUrl: null, thumbnailPathname: null, size: null });
    const b = await db.createMedia({ title: 'Hidden', type: 'document', description: null, contentKind: 'link', url: 'https://x/z', pathname: null, thumbnailUrl: null, thumbnailPathname: null, size: null });
    await db.setMediaPublished(b, false);
    void a;
    const auth = await import('@/lib/practitionerAuth');
    vi.spyOn(auth, 'getSessionPractitioner').mockResolvedValue({ id: 1, status: 'approved' } as never);
    const { GET } = await import('@/app/api/resources/route');
    const res = await GET(new Request('http://x/api/resources'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.media.map((m: { title: string }) => m.title)).toEqual(['Pub']);
  });
});
