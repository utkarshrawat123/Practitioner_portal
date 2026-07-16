import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-ce-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});
async function seed(email = 'a@example.com') {
  const db = await import('@/lib/db');
  const p = await db.insertApplication({ name: 'Jane Smith', email, registerBody: 'BANT', registerNumber: email, qualificationStatus: 'qualified' });
  return db.markApproved(p.id, { affiliateCode: `WN-${email}`, affiliateLink: 'x', pendingSync: false, decidedBy: 'system' });
}

describe('events db', () => {
  it('creates, publishes, registers, counts, unregisters', async () => {
    const db = await import('@/lib/db');
    const p = await seed();
    const e = await db.createHubEvent({ title: 'Gut webinar', startsAt: '2026-08-01T18:00:00Z', eventType: 'online', capacity: 100, published: true });
    expect(e.eventType).toBe('online');
    expect((await db.listPublishedEvents()).map((x) => x.title)).toEqual(['Gut webinar']);
    await db.registerForEvent(p.id, e.id);
    await db.registerForEvent(p.id, e.id); // idempotent
    expect(await db.eventRegistrationCount(e.id)).toBe(1);
    expect(await db.registeredEventIds(p.id)).toEqual([e.id]);
    await db.unregisterFromEvent(p.id, e.id);
    expect(await db.eventRegistrationCount(e.id)).toBe(0);
  });
});

describe('community db', () => {
  it('creates posts, replies, toggles upvotes, and moderation hides', async () => {
    const db = await import('@/lib/db');
    const a = await seed('a@example.com');
    const b = await seed('b@example.com');
    const postId = await db.createCommunityPost({ practitionerId: a.id, authorName: a.name, postType: 'discussion', title: 'Hello', body: 'First post' });
    await db.createCommunityReply({ postId, practitionerId: b.id, authorName: b.name, body: 'Nice!' });

    let posts = await db.listCommunityPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].replyCount).toBe(1);
    expect(posts[0].upvotes).toBe(0);

    expect(await db.toggleUpvote(b.id, postId)).toBe(true);
    expect(await db.toggleUpvote(a.id, postId)).toBe(true);
    posts = await db.listCommunityPosts();
    expect(posts[0].upvotes).toBe(2);
    expect(await db.toggleUpvote(b.id, postId)).toBe(false); // toggled off
    expect((await db.getCommunityPost(postId))!.upvotes).toBe(1);

    await db.setPostHidden(postId, true);
    expect(await db.listCommunityPosts()).toHaveLength(0);
    expect(await db.listCommunityPosts({ includeHidden: true })).toHaveLength(1);
  });

  it('pinned posts sort first', async () => {
    const db = await import('@/lib/db');
    const a = await seed();
    const p1 = await db.createCommunityPost({ practitionerId: a.id, authorName: a.name, postType: 'discussion', title: 'Old', body: 'x' });
    const p2 = await db.createCommunityPost({ practitionerId: a.id, authorName: a.name, postType: 'discussion', title: 'New', body: 'x' });
    await db.setPostPinned(p1, true);
    const posts = await db.listCommunityPosts();
    expect(posts[0].id).toBe(p1);
    expect(posts[1].id).toBe(p2);
  });
});
