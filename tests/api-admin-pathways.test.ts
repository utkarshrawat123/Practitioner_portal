import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-apiadminpath-'));
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

describe('/api/admin/pathways', () => {
  it('401s without cookie', async () => {
    const { GET } = await import('@/app/api/admin/pathways/route');
    expect((await GET(new Request('http://x/'))).status).toBe(401);
  });

  it('creates a pathway, adds a module from content, then deletes', async () => {
    const cookie = await adminCookie();
    const db = await import('@/lib/db');
    const lid = await db.insertLesson({ sourceFile: 's', title: 'Lesson A', summary: 'x', takeaways: [], quiz: { questions: [] } as never, topics: [], claimFlags: [] });
    await db.setLessonStatus(lid, 'published');

    const { POST } = await import('@/app/api/admin/pathways/route');
    const created = await POST(new Request('http://x/', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ title: 'Gut Health', category: 'Gut Health', cpdHours: 3, published: true }),
    }));
    expect(created.status).toBe(201);
    const pid = (await created.json()).pathway.id as number;

    const content = await (await import('@/app/api/admin/pathways/content/route')).GET(new Request('http://x/', { headers: { cookie } }));
    expect((await content.json()).lessons).toHaveLength(1);

    const { POST: addModule } = await import('@/app/api/admin/pathways/[id]/modules/route');
    const modRes = await addModule(
      new Request('http://x/', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ title: 'M1', contentKind: 'lesson', contentId: lid, required: true }) }),
      { params: { id: String(pid) } }
    );
    expect(modRes.status).toBe(201);

    const { GET: detail } = await import('@/app/api/admin/pathways/[id]/route');
    const det = await detail(new Request('http://x/', { headers: { cookie } }), { params: { id: String(pid) } });
    expect((await det.json()).modules).toHaveLength(1);

    const { DELETE } = await import('@/app/api/admin/pathways/[id]/route');
    const del = await DELETE(new Request('http://x/', { method: 'DELETE', headers: { cookie } }), { params: { id: String(pid) } });
    expect((await del.json()).ok).toBe(true);
    expect(await db.getPathway(pid)).toBeNull();
  });
});
