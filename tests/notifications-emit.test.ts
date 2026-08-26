import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-emit-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function practitioner(
  email: string,
  opts: { approve?: boolean; status?: 'qualified' | 'student' } = {}
) {
  const { insertApplication, execForTests } = await import('@/lib/db');
  const p = await insertApplication({
    name: 'Emit Test', email, registerBody: 'BANT',
    registerNumber: '222', qualificationStatus: opts.status ?? 'qualified',
  });
  if (opts.approve !== false) {
    await execForTests(`UPDATE practitioners SET status = 'approved' WHERE id = ?`, [p.id]);
  }
  return p;
}

async function lastInsertId(): Promise<number> {
  const { execForTests } = await import('@/lib/db');
  return Number((await execForTests(`SELECT last_insert_rowid() AS id`)).rows[0].id);
}

describe('content publication', () => {
  it('notifies every approved practitioner when a lesson is published', async () => {
    const { setLessonStatus, listNotifications, execForTests } = await import('@/lib/db');
    const a = await practitioner('c1@example.com');
    const pending = await practitioner('c2@example.com', { approve: false });

    await execForTests(
      `INSERT INTO lessons (title, summary, takeaways_json, quiz_json, topics_json, claim_flags_json, status)
       VALUES ('Iron status', 'A summary', '[]', '{}', '[]', '[]', 'draft')`
    );
    await setLessonStatus(await lastInsertId(), 'published');

    const forA = await listNotifications(a.id);
    expect(forA).toHaveLength(1);
    expect(forA[0].title).toContain('Iron status');
    expect(forA[0].href).toBe('/library');
    // Pending accounts are not notified.
    expect(await listNotifications(pending.id)).toHaveLength(0);
  });

  it('does not notify when a lesson is rejected rather than published', async () => {
    const { setLessonStatus, listNotifications, execForTests } = await import('@/lib/db');
    const a = await practitioner('c3@example.com');
    await execForTests(
      `INSERT INTO lessons (title, summary, takeaways_json, quiz_json, topics_json, claim_flags_json, status)
       VALUES ('Rejected one', 'A summary', '[]', '{}', '[]', '[]', 'draft')`
    );
    await setLessonStatus(await lastInsertId(), 'rejected');

    expect(await listNotifications(a.id)).toHaveLength(0);
  });

  it('respects audience on toolkit publication', async () => {
    const { updateToolkitResource, listNotifications, execForTests } = await import('@/lib/db');
    const qualified = await practitioner('c4@example.com', { status: 'qualified' });
    const student = await practitioner('c5@example.com', { status: 'student' });

    await execForTests(
      `INSERT INTO toolkit_resources (title, type, audience, content_kind, url, published)
       VALUES ('Qualified only guide', 'protocol', 'qualified', 'link', 'https://x/y', 0)`
    );
    await updateToolkitResource(await lastInsertId(), { published: true });

    expect(await listNotifications(qualified.id)).toHaveLength(1);
    expect(await listNotifications(student.id)).toHaveLength(0);
  });
});

describe('community replies', () => {
  it('notifies the post author', async () => {
    const { createCommunityPost, createCommunityReply, listNotifications } = await import('@/lib/db');
    const author = await practitioner('r1@example.com');
    const replier = await practitioner('r2@example.com');
    const postId = await createCommunityPost({
      practitionerId: author.id, authorName: 'Author', postType: 'discussion',
      title: 'How do you handle low ferritin?', body: 'Curious.',
    });

    await createCommunityReply({
      postId, practitionerId: replier.id, authorName: 'Replier', body: 'Here is my take.',
    });

    const forAuthor = await listNotifications(author.id);
    expect(forAuthor).toHaveLength(1);
    expect(forAuthor[0].kind).toBe('reply');
    expect(forAuthor[0].href).toBe('/community');
  });

  it('NEVER notifies you about your own reply', async () => {
    const { createCommunityPost, createCommunityReply, listNotifications } = await import('@/lib/db');
    const author = await practitioner('r3@example.com');
    const postId = await createCommunityPost({
      practitionerId: author.id, authorName: 'Author', postType: 'discussion',
      title: 'Talking to myself', body: 'Hello.',
    });

    await createCommunityReply({
      postId, practitionerId: author.id, authorName: 'Author', body: 'Replying to myself.',
    });

    expect(await listNotifications(author.id)).toHaveLength(0);
  });
});

describe('cart paid', () => {
  it('notifies the cart owner once, and NOT AGAIN on a repeat call', async () => {
    const { createPatientCart, markCartPaid, listNotifications } = await import('@/lib/db');
    const owner = await practitioner('cart1@example.com');
    const cart = await createPatientCart({
      practitionerId: owner.id,
      patientName: 'Pat',
      patientEmail: 'pat@example.com',
      token: 'tok-notif-test',
      provider: 'mock',
      externalId: null,
      payUrl: 'http://localhost:3100/pay/tok-notif-test',
      subtotal: 30,
      discountAmount: 0,
      total: 30,
      commissionAmount: 6,
      currency: 'GBP',
      items: [{ productRef: 'sku-1', title: 'Multi', imageUrl: null, unitPrice: 30, qty: 1 }],
    });

    await markCartPaid(cart.id);
    expect(await listNotifications(owner.id)).toHaveLength(1);

    // A Shopify webhook retry must not notify twice — markCartPaid guards on
    // status != 'paid', and the notification sits behind the same guard.
    await markCartPaid(cart.id);
    expect(await listNotifications(owner.id)).toHaveLength(1);
  });
});
