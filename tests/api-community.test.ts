import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-comm-'));
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
async function approved(email = 'jane@example.com') {
  const db = await import('@/lib/db');
  const p = await db.insertApplication({ name: 'Jane Smith', email, registerBody: 'BANT', registerNumber: email, qualificationStatus: 'qualified' });
  return db.markApproved(p.id, { affiliateCode: `WN-${email}`, affiliateLink: 'x', pendingSync: false, decidedBy: 'system' });
}
async function cookie(id: number): Promise<string> {
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return sessionCookieHeader(id).split(';')[0];
}

describe('community APIs', () => {
  it('post → reply → upvote flow', async () => {
    const p = await approved();
    const c = await cookie(p.id);
    const { POST: create, GET: list } = await import('@/app/api/me/community/route');
    const created = await create(new Request('http://x/', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: c }, body: JSON.stringify({ postType: 'ask_expert', title: 'Q about zinc', body: 'What dose?' }) }));
    expect(created.status).toBe(201);
    const postId = (await created.json()).post.id as number;

    const { POST: reply } = await import('@/app/api/me/community/[id]/reply/route');
    expect((await reply(new Request('http://x/', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: c }, body: JSON.stringify({ body: 'Depends on the patient.' }) }), { params: { id: String(postId) } })).status).toBe(201);

    const { POST: upvote } = await import('@/app/api/me/community/[id]/upvote/route');
    expect((await (await upvote(new Request('http://x/', { method: 'POST', headers: { cookie: c } }), { params: { id: String(postId) } })).json()).upvoted).toBe(true);

    const listed = await list(new Request('http://x/', { headers: { cookie: c } }));
    const posts = (await listed.json()).posts;
    expect(posts[0].replyCount).toBe(1);
    expect(posts[0].upvotes).toBe(1);
    expect(posts[0].upvotedByMe).toBe(true);
  });

  it('admin can hide a post so practitioners no longer see it', async () => {
    const p = await approved();
    const c = await cookie(p.id);
    const db = await import('@/lib/db');
    const postId = await db.createCommunityPost({ practitionerId: p.id, authorName: p.name, postType: 'discussion', title: 'T', body: 'B' });

    const admin = await adminCookie();
    const { PATCH } = await import('@/app/api/admin/community/[id]/route');
    await PATCH(new Request('http://x/', { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: admin }, body: JSON.stringify({ hidden: true }) }), { params: { id: String(postId) } });

    const { GET: list } = await import('@/app/api/me/community/route');
    const posts = (await (await list(new Request('http://x/', { headers: { cookie: c } }))).json()).posts;
    expect(posts).toHaveLength(0);
  });

  it('401s without session/admin', async () => {
    const { GET } = await import('@/app/api/me/community/route');
    expect((await GET(new Request('http://x/'))).status).toBe(401);
    const { GET: adminGet } = await import('@/app/api/admin/community/route');
    expect((await adminGet(new Request('http://x/'))).status).toBe(401);
  });
});
