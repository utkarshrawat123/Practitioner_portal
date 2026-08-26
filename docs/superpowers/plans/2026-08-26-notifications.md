# Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A practitioner sees a bell in the sidebar with an unread count, opens it, and reads what happened — new content, a reply to their post, a credited referral, a paid cart.

**Architecture:** Fan-out rows written at emit time, one per eligible practitioner, in a single `notifications` table. Emitters live inside `lib/db.ts` at four existing functions so they cannot be forgotten at a second call site. Rows are self-contained (title/body/href stored, not joined) because a notification records what happened rather than describing a live thing.

**Tech Stack:** Next.js 15 App Router on Cloudflare Workers via OpenNext, TypeScript, libSQL/D1, vitest, lucide-react.

## Spec correction — read before Task 2

The spec (§3) says audience gating applies at fan-out. **That is only possible where an
`audience` column exists.** Verified:

| Content type | Has `audience`? |
|---|---|
| `toolkit_resources` | **yes** (`lib/migrations.ts:89`) |
| `pathways` | **yes** (`lib/migrations.ts:49`) |
| `media` | **no** — `published` only |
| `lessons` | **no** — `status` only |

So: gate toolkit and pathway notifications by audience; notify **all** approved
practitioners for lessons and media, because there is no audience to gate on. Do not write
a test asserting audience gating for lessons or media — it would assert a column that does
not exist. This is the same class of error already corrected once in
`DECK_GAP_ANALYSIS.md` §8.

## Global Constraints

- **Branch:** `feat/notifications`, already cut from `cloudflare-migration` with the spec commit.
- **Node is not on PATH in tool shells.** Every shell starts with:
  `export PATH="/c/Users/UtkarshRawat/AppData/Local/node/node-v22.20.0-win-x64:$PATH"`
- **TDD, always.** Failing test first, then the minimal implementation.
- **Gates:** `npm test` (baseline **502 passing / 108 files**) AND `npm run build`. Migration + routes means `npm run preview:cf` is also required (Task 5).
- **`npm run build` corrupts `.next` if a dev server is running.** Stop dev first.
- **`rm -rf .open-next` fails with `EBUSY`** while any `workerd`/`wrangler` process lives — kill them first.
- **Mock-until-keyed is sacred.** No keyed path here; must never require a secret.
- **Style:** use the primitives in `components/ui/index.tsx`. No `border border-stone`, no square uppercase buttons.
- **Never notify the actor.** Replying to your own post must not notify you.
- **Approved practitioners only.** `status = 'approved'`.
- **Idempotence.** Emit only when the guarded UPDATE actually changed a row — `run()` returns `{ rowsAffected }`. A Shopify webhook retry must not re-notify.

---

### Task 1: Migration + notification core

**Files:**
- Modify: `lib/migrations.ts` (append `020_notifications`)
- Modify: `lib/db.ts` (add types + helpers after the saved-items block, ~line 1630)
- Test: `tests/notifications-db.test.ts`

**Interfaces:**
- Consumes: `run`, `all`, `one`, `num` (module-private in `lib/db.ts`).
- Produces:
  - `export type NotificationKind = 'content' | 'reply' | 'referral' | 'cart'`
  - `export interface Notification { id: number; kind: NotificationKind; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string }`
  - `notifyPractitioners(practitionerIds: number[], n: { kind: NotificationKind; title: string; body?: string | null; href?: string | null }): Promise<void>`
  - `listNotifications(practitionerId: number, limit?: number): Promise<Notification[]>`
  - `unreadNotificationCount(practitionerId: number): Promise<number>`
  - `markNotificationsRead(practitionerId: number, id?: number): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/notifications-db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-notif-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function practitioner(email: string, approve = true) {
  const { insertApplication, execForTests } = await import('@/lib/db');
  const p = await insertApplication({
    name: 'Notif Test', email, registerBody: 'BANT',
    registerNumber: '111', qualificationStatus: 'qualified',
  });
  if (approve) await execForTests(`UPDATE practitioners SET status = 'approved' WHERE id = ?`, [p.id]);
  return p;
}

describe('020_notifications migration', () => {
  it('creates the notifications table', async () => {
    const { execForTests } = await import('@/lib/db');
    const names = (await execForTests("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((r) => r.name as string);
    expect(names).toContain('notifications');
  });
});

describe('notification core', () => {
  it('writes one row per practitioner', async () => {
    const { notifyPractitioners, listNotifications } = await import('@/lib/db');
    const a = await practitioner('n1@example.com');
    const b = await practitioner('n2@example.com');
    await notifyPractitioners([a.id, b.id], { kind: 'content', title: 'New lesson', href: '/library' });

    expect(await listNotifications(a.id)).toHaveLength(1);
    expect(await listNotifications(b.id)).toHaveLength(1);
    expect((await listNotifications(a.id))[0].title).toBe('New lesson');
  });

  it('is a no-op for an empty recipient list', async () => {
    const { notifyPractitioners } = await import('@/lib/db');
    await expect(notifyPractitioners([], { kind: 'content', title: 'nobody' })).resolves.toBeUndefined();
  });

  it('counts only unread', async () => {
    const { notifyPractitioners, unreadNotificationCount, markNotificationsRead } = await import('@/lib/db');
    const p = await practitioner('n3@example.com');
    await notifyPractitioners([p.id], { kind: 'content', title: 'One' });
    await notifyPractitioners([p.id], { kind: 'content', title: 'Two' });
    expect(await unreadNotificationCount(p.id)).toBe(2);

    await markNotificationsRead(p.id);
    expect(await unreadNotificationCount(p.id)).toBe(0);
  });

  it('marks a single notification read when given an id', async () => {
    const { notifyPractitioners, listNotifications, markNotificationsRead, unreadNotificationCount } = await import('@/lib/db');
    const p = await practitioner('n4@example.com');
    await notifyPractitioners([p.id], { kind: 'content', title: 'One' });
    await notifyPractitioners([p.id], { kind: 'content', title: 'Two' });
    const [first] = await listNotifications(p.id);

    await markNotificationsRead(p.id, first.id);
    expect(await unreadNotificationCount(p.id)).toBe(1);
  });

  it('never touches another practitioner’s rows', async () => {
    const { notifyPractitioners, markNotificationsRead, unreadNotificationCount } = await import('@/lib/db');
    const a = await practitioner('n5@example.com');
    const b = await practitioner('n6@example.com');
    await notifyPractitioners([a.id, b.id], { kind: 'content', title: 'Shared' });

    await markNotificationsRead(a.id);
    expect(await unreadNotificationCount(a.id)).toBe(0);
    expect(await unreadNotificationCount(b.id)).toBe(1);
  });

  it('returns newest first', async () => {
    const { notifyPractitioners, listNotifications, execForTests } = await import('@/lib/db');
    const p = await practitioner('n7@example.com');
    await notifyPractitioners([p.id], { kind: 'content', title: 'Older' });
    await notifyPractitioners([p.id], { kind: 'content', title: 'Newer' });
    await execForTests(`UPDATE notifications SET created_at = '2020-01-01 00:00:00' WHERE title = 'Older'`);

    expect((await listNotifications(p.id)).map((n) => n.title)).toEqual(['Newer', 'Older']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/notifications-db.test.ts`
Expected: FAIL — no `notifications` table and no exported helpers.

- [ ] **Step 3: Write minimal implementation**

Append to `MIGRATIONS` in `lib/migrations.ts`, after `019_saved_items`:

```ts
  {
    // In-app notifications. Fan-out: one row per recipient, written at emit
    // time. Rows are self-contained (title/body/href stored, not joined)
    // because a notification records WHAT HAPPENED — it must stay readable
    // even if the content is later renamed or unpublished. That is the
    // opposite of saved_items, which describes a live thing.
    id: '020_notifications',
    sql: `
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  href TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_practitioner
  ON notifications(practitioner_id, read_at);
`,
  },
```

Add to `lib/db.ts` after the saved-items helpers:

```ts
export type NotificationKind = 'content' | 'reply' | 'referral' | 'cart';

export interface Notification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Fan-out: one row per recipient. No-op on an empty list. */
export async function notifyPractitioners(
  practitionerIds: number[],
  n: { kind: NotificationKind; title: string; body?: string | null; href?: string | null }
): Promise<void> {
  for (const id of practitionerIds) {
    await run(
      `INSERT INTO notifications (practitioner_id, kind, title, body, href) VALUES (?, ?, ?, ?, ?)`,
      [id, n.kind, n.title, n.body ?? null, n.href ?? null]
    );
  }
}

export async function listNotifications(practitionerId: number, limit = 30): Promise<Notification[]> {
  const rows = await all(
    `SELECT * FROM notifications WHERE practitioner_id = ?
     ORDER BY created_at DESC, id DESC LIMIT ?`,
    [practitionerId, limit]
  );
  return rows.map((r) => ({
    id: num(r.id),
    kind: r.kind as NotificationKind,
    title: r.title as string,
    body: (r.body as string) ?? null,
    href: (r.href as string) ?? null,
    readAt: (r.read_at as string) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function unreadNotificationCount(practitionerId: number): Promise<number> {
  const r = await one(
    `SELECT COUNT(*) AS n FROM notifications WHERE practitioner_id = ? AND read_at IS NULL`,
    [practitionerId]
  );
  return num(r?.n);
}

/** Marks all this practitioner's notifications read, or just one when `id` is given. */
export async function markNotificationsRead(practitionerId: number, id?: number): Promise<void> {
  if (id === undefined) {
    await run(
      `UPDATE notifications SET read_at = datetime('now') WHERE practitioner_id = ? AND read_at IS NULL`,
      [practitionerId]
    );
  } else {
    await run(
      `UPDATE notifications SET read_at = datetime('now') WHERE practitioner_id = ? AND id = ? AND read_at IS NULL`,
      [practitionerId, id]
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/notifications-db.test.ts tests/migrations.test.ts`
Expected: PASS (7 + existing). `tests/migrations.test.ts` needs no edit — it asserts the recorded set equals `MIGRATIONS`.

- [ ] **Step 5: Commit**

```bash
git add lib/migrations.ts lib/db.ts tests/notifications-db.test.ts
git commit -m "feat(notifications): migration 020 + fan-out core"
```

---

### Task 2: Emit at the four seams

**Files:**
- Modify: `lib/db.ts` — `setLessonStatus` (~977), `setMediaPublished` (~1099), `updateToolkitResource` (~1192), `updatePathway` (~1427), `createCommunityReply` (~1765), `creditReferral` (~468), `markCartPaid` (~2094)
- Test: `tests/notifications-emit.test.ts`

**Interfaces:**
- Consumes: `notifyPractitioners`, `listNotifications`, `unreadNotificationCount` (Task 1); `hasAccess` from `@/lib/access` (already imported in `lib/db.ts`).
- Produces: no new exports. Existing function signatures are unchanged — emission is a side effect.

**The idempotence rule.** `creditReferral` and `markCartPaid` both carry a guard
(`status != 'credited'` / `status != 'paid'`). `run()` returns `{ rowsAffected }`. Emit
**only when `rowsAffected > 0`**, otherwise a Shopify webhook retry notifies repeatedly
about one payment.

- [ ] **Step 1: Write the failing test**

```ts
// tests/notifications-emit.test.ts
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

async function practitioner(email: string, opts: { approve?: boolean; status?: 'qualified' | 'student' } = {}) {
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

describe('content publication', () => {
  it('notifies every approved practitioner when a lesson is published', async () => {
    const { setLessonStatus, listNotifications, execForTests } = await import('@/lib/db');
    const a = await practitioner('c1@example.com');
    const pending = await practitioner('c2@example.com', { approve: false });

    await execForTests(
      `INSERT INTO lessons (title, summary, takeaways_json, quiz_json, topics_json, claim_flags_json, status)
       VALUES ('Iron status', 'A summary', '[]', '{}', '[]', '[]', 'draft')`
    );
    const id = Number((await execForTests(`SELECT last_insert_rowid() AS id`)).rows[0].id);
    await setLessonStatus(id, 'published');

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
    const id = Number((await execForTests(`SELECT last_insert_rowid() AS id`)).rows[0].id);
    await setLessonStatus(id, 'rejected');

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
    const id = Number((await execForTests(`SELECT last_insert_rowid() AS id`)).rows[0].id);
    await updateToolkitResource(id, { published: true });

    expect(await listNotifications(qualified.id)).toHaveLength(1);
    expect(await listNotifications(student.id)).toHaveLength(0);
  });
});

describe('community replies', () => {
  it('notifies the post author', async () => {
    const { createCommunityPost, createCommunityReply, listNotifications } = await import('@/lib/db');
    const author = await practitioner('r1@example.com');
    const replier = await practitioner('r2@example.com');
    const post = await createCommunityPost({
      practitionerId: author.id, authorName: 'Author', postType: 'discussion',
      title: 'How do you handle low ferritin?', body: 'Curious.',
    });

    await createCommunityReply({
      postId: post.id, practitionerId: replier.id, authorName: 'Replier', body: 'Here is my take.',
    });

    const forAuthor = await listNotifications(author.id);
    expect(forAuthor).toHaveLength(1);
    expect(forAuthor[0].kind).toBe('reply');
    expect(forAuthor[0].href).toBe('/community');
  });

  it('NEVER notifies you about your own reply', async () => {
    const { createCommunityPost, createCommunityReply, listNotifications } = await import('@/lib/db');
    const author = await practitioner('r3@example.com');
    const post = await createCommunityPost({
      practitionerId: author.id, authorName: 'Author', postType: 'discussion',
      title: 'Talking to myself', body: 'Hello.',
    });

    await createCommunityReply({
      postId: post.id, practitionerId: author.id, authorName: 'Author', body: 'Replying to myself.',
    });

    expect(await listNotifications(author.id)).toHaveLength(0);
  });
});

describe('cart paid', () => {
  it('notifies the cart owner once, and NOT AGAIN on a repeat call', async () => {
    const { createPatientCart, markCartPaid, listNotifications } = await import('@/lib/db');
    const owner = await practitioner('cart1@example.com');
    const cart = await createPatientCart({
      practitionerId: owner.id, patientName: 'Pat', patientEmail: 'pat@example.com',
      currency: 'GBP', items: [{ productRef: 'sku-1', title: 'Multi', imageUrl: null, unitPrice: 30, qty: 1 }],
    });

    await markCartPaid(cart.id);
    expect(await listNotifications(owner.id)).toHaveLength(1);

    // A Shopify webhook retry must not notify twice — markCartPaid guards on
    // status != 'paid', and the notification sits behind the same guard.
    await markCartPaid(cart.id);
    expect(await listNotifications(owner.id)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/notifications-emit.test.ts`
Expected: FAIL — nothing emits yet, so every `listNotifications` assertion returns `[]`.

> If `createCommunityPost` or `createPatientCart` has a different signature than used
> above, read the real one in `lib/db.ts` and adjust the **test setup** to match. Do not
> change the assertions.

- [ ] **Step 3: Write minimal implementation**

Add this private helper to `lib/db.ts`, above `setLessonStatus`:

```ts
/** Approved practitioner ids allowed to see `resource`, minus `exclude`. */
async function notifiableIds(
  resource: { audience?: string | null } | null,
  exclude?: number
): Promise<number[]> {
  const rows = await all(
    `SELECT id, qualification_status FROM practitioners WHERE status = 'approved'`
  );
  return rows
    .filter((r) =>
      resource === null
        ? true
        : hasAccess({ qualificationStatus: r.qualification_status as QualificationStatus }, resource)
    )
    .map((r) => num(r.id))
    .filter((id) => id !== exclude);
}
```

Then wire each seam.

`setLessonStatus` — notify only on `published` (lessons have no audience, so pass `null`):

```ts
export async function setLessonStatus(
  id: number,
  status: 'published' | 'rejected' | 'draft'
): Promise<LessonRow> {
  await run(`UPDATE lessons SET status = ?, decided_at = datetime('now') WHERE id = ?`, [status, id]);
  const lesson = (await getLesson(id))!;
  if (status === 'published') {
    await notifyPractitioners(await notifiableIds(null), {
      kind: 'content',
      title: `New lesson: ${lesson.title}`,
      body: lesson.summary?.slice(0, 140) ?? null,
      href: '/library',
    });
  }
  return lesson;
}
```

`setMediaPublished` — media has no audience either:

```ts
export async function setMediaPublished(id: number, published: boolean): Promise<MediaRow> {
  await run(`UPDATE media SET published = ? WHERE id = ?`, [published ? 1 : 0, id]);
  const media = (await getMedia(id))!;
  if (published) {
    await notifyPractitioners(await notifiableIds(null), {
      kind: 'content',
      title: `New resource: ${media.title}`,
      body: media.description,
      href: '/resources',
    });
  }
  return media;
}
```

`updateToolkitResource` — toolkit **has** audience. Emit only when this call flips
`published` to true, so repeated saves of an already-published item stay silent:

```ts
// inside updateToolkitResource, after the UPDATE and after re-reading the row:
  if (patch.published === true && updated) {
    await notifyPractitioners(await notifiableIds(updated), {
      kind: 'content',
      title: `New in the toolkit: ${updated.title}`,
      body: updated.description,
      href: '/toolkit',
    });
  }
```

`updatePathway` — pathways have audience, same shape:

```ts
  if (patch.published === true && updated) {
    await notifyPractitioners(await notifiableIds(updated), {
      kind: 'content',
      title: `New pathway: ${updated.title}`,
      body: updated.description,
      href: '/learning',
    });
  }
```

`createCommunityReply` — notify the author, never the replier:

```ts
export async function createCommunityReply(p: { postId: number; practitionerId: number; authorName: string; body: string }): Promise<number> {
  const res = await run(`INSERT INTO community_replies (post_id, practitioner_id, author_name, body) VALUES (?, ?, ?, ?)`, [p.postId, p.practitionerId, p.authorName, p.body]);
  const post = await getCommunityPost(p.postId);
  // Never notify yourself about your own reply.
  if (post && post.practitionerId !== p.practitionerId) {
    await notifyPractitioners([post.practitionerId], {
      kind: 'reply',
      title: `${p.authorName} replied to your post`,
      body: post.title,
      href: '/community',
    });
  }
  return res.lastInsertRowid;
}
```

`creditReferral` — emit only when the guarded UPDATE actually changed a row:

```ts
export async function creditReferral(referralId: number, orderId: string, bonus: number): Promise<void> {
  const res = await run(
    `UPDATE practitioner_referrals
        SET status = 'credited',
            first_sale_at = COALESCE(first_sale_at, datetime('now')),
            completed_at  = datetime('now'),
            credited_at   = datetime('now'),
            qualifying_order_id = ?,
            bonus_amount = ?
      WHERE id = ? AND status != 'credited'`,
    [orderId, bonus, referralId]
  );
  // Guarded UPDATE: only notify when this call is the one that credited it.
  if (res.rowsAffected > 0) {
    const referral = await getReferralById(referralId);
    if (referral) {
      await notifyPractitioners([referral.referrerId], {
        kind: 'referral',
        title: 'A referral was credited',
        body: 'Your referral bonus has been added to your earnings.',
        href: '/referrals',
      });
    }
  }
}
```

`markCartPaid` — same guarded pattern:

```ts
export async function markCartPaid(id: number): Promise<void> {
  const res = await run(
    `UPDATE patient_carts SET status = 'paid', paid_at = datetime('now') WHERE id = ? AND status != 'paid'`,
    [id]
  );
  // Only the call that actually flipped it to paid notifies — a webhook retry must not.
  if (res.rowsAffected > 0) {
    const row = await one(`SELECT practitioner_id, patient_name FROM patient_carts WHERE id = ?`, [id]);
    if (row) {
      await notifyPractitioners([num(row.practitioner_id)], {
        kind: 'cart',
        title: 'A patient cart was paid',
        body: `${row.patient_name as string} completed their order.`,
        href: '/carts',
      });
    }
  }
}
```

> If `getReferralById` returns snake_case (`referrer_id`) rather than `referrerId`, read the
> `ReferralRow` interface in `lib/db.ts` and use whichever it actually is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/notifications-emit.test.ts`
Expected: PASS (6 tests).

Then the neighbours that touch these functions:
Run: `npx vitest run tests/api-referrals.test.ts tests/api-carts.test.ts tests/api-community.test.ts tests/api-admin-lessons.test.ts tests/api-webhooks-shopify.test.ts`
Expected: PASS. These functions now write extra rows; if a test asserts an exact row count somewhere, update that assertion — the new rows are intended.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts tests/notifications-emit.test.ts
git commit -m "feat(notifications): emit at publish, reply, referral and cart-paid"
```

---

### Task 3: The API routes

**Files:**
- Create: `app/api/me/notifications/route.ts`
- Create: `app/api/me/notifications/read/route.ts`
- Test: `tests/api-me-notifications.test.ts`

**Interfaces:**
- Consumes: `listNotifications`, `unreadNotificationCount`, `markNotificationsRead`, `notifyPractitioners` (Task 1); `getSessionPractitioner` from `@/lib/practitionerAuth`.
- Produces: `GET /api/me/notifications` → `{ items, unread }`; `POST /api/me/notifications/read` → `{ ok: true }`, body optionally `{ id }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/api-me-notifications.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api-me-notifications.test.ts`
Expected: FAIL — cannot resolve either route module.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/api/me/notifications/route.ts
import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { listNotifications, unreadNotificationCount } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const [items, unread] = await Promise.all([
    listNotifications(p.id),
    unreadNotificationCount(p.id),
  ]);
  return NextResponse.json({ items, unread });
}
```

```ts
// app/api/me/notifications/read/route.ts
import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { markNotificationsRead } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  // The practitioner id always comes from the session, never the body, so one
  // practitioner can never clear another's notifications.
  let id: number | undefined;
  try {
    const body = (await req.json()) as { id?: unknown };
    if (typeof body?.id === 'number' && Number.isInteger(body.id)) id = body.id;
  } catch {
    /* no body — mark all read */
  }

  await markNotificationsRead(p.id, id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api-me-notifications.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/me/notifications tests/api-me-notifications.test.ts
git commit -m "feat(notifications): /api/me/notifications read + mark-read"
```

---

### Task 4: The bell and panel

**Files:**
- Create: `components/NotificationBell.tsx`
- Modify: `components/SideNav.tsx` (render the bell beside the wordmark, desktop and mobile)
- Modify: `components/Chrome.tsx` (pass `signedIn` through if not already available to `SideNav`)

**Interfaces:**
- Consumes: `GET /api/me/notifications`, `POST /api/me/notifications/read` (Task 3).
- Produces: `NotificationBell()` — a self-contained client component that fetches its own data.

No component tests exist in this repo and this task does not add any. Verified by the type
checker, `npm run build`, and the browser pass in Task 5.

- [ ] **Step 1: Create the component**

```tsx
// components/NotificationBell.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';

interface Item {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

/** "3d" / "4h" / "just now" — compact enough for a 320px panel. */
function ago(iso: string): string {
  const then = new Date(iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z')).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/me/notifications');
      if (!r.ok) return;
      const b = (await r.json()) as { items: Item[]; unread: number };
      setItems(b.items ?? []);
      setUnread(b.unread ?? 0);
    } catch {
      /* offline or signed out — leave the last known state */
    }
  }, []);

  // Notifications are not a live conversation, so 60s rather than the chat
  // widget's 2.5s. Opening the panel refetches, so it is never stale in view.
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Click-away closes the panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function markAll() {
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
    await fetch('/api/me/notifications/read', { method: 'POST' });
    load();
  }

  async function openItem(item: Item) {
    if (!item.readAt) {
      await fetch('/api/me/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
    }
    setOpen(false);
    if (item.href) window.location.href = item.href;
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.7} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-terracotta px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-50 w-[320px] overflow-hidden rounded-card bg-white shadow-lift lg:left-auto lg:right-[-300px]">
          <div className="flex items-center justify-between gap-3 border-b border-ink/8 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-label text-ink2/55">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-[12px] text-terracotta transition-colors hover:text-terracotta-mid"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-[14px] text-ink2/50">Nothing yet.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-blush/60 ${
                    item.readAt ? '' : 'bg-blush/40'
                  }`}
                >
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.readAt ? 'bg-transparent' : 'bg-terracotta'
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-ink">{item.title}</span>
                    {item.body && (
                      <span className="mt-0.5 block truncate text-[13px] text-ink2/65">{item.body}</span>
                    )}
                    <span className="mt-1 block text-[11px] text-ink2/45">{ago(item.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Put the bell in the sidebar**

In `components/SideNav.tsx`, add the import:

```tsx
import NotificationBell from '@/components/NotificationBell';
```

Wrap the desktop `<Wordmark />` so the bell sits beside it. Replace:

```tsx
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col bg-navy lg:flex">
        <Wordmark />
```

with:

```tsx
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col bg-navy lg:flex">
        <div className="flex items-start justify-between pr-4">
          <Wordmark />
          <div className="pt-7"><NotificationBell /></div>
        </div>
```

In the mobile top bar, add the bell at the right-hand end. Replace:

```tsx
        <span className="font-body text-[13px] font-semibold uppercase tracking-[0.16em] text-white">
          Wild Nutrition<sup className="align-super text-[7px]">®</sup>
        </span>
      </div>
```

with:

```tsx
        <span className="font-body text-[13px] font-semibold uppercase tracking-[0.16em] text-white">
          Wild Nutrition<sup className="align-super text-[7px]">®</sup>
        </span>
        <div className="ml-auto"><NotificationBell /></div>
      </div>
```

`SideNav` only renders when signed in (see `Chrome.tsx`), so the bell never appears for
signed-out visitors and no extra prop is needed.

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit` — expect no errors outside `tests/`.
Run: `npm run build` — expect a clean build.

- [ ] **Step 4: Commit**

```bash
git add components/NotificationBell.tsx components/SideNav.tsx
git commit -m "feat(notifications): sidebar bell with unread badge and panel"
```

---

### Task 5: Workers verification, smoke coverage and docs

**Files:**
- Modify: `scripts/smoke-local.mjs` (add `/api/me/notifications` to `PRACTITIONER_APIS`)
- Create: `scripts/verify-notifications.mjs`
- Modify: `docs/LOCAL_TEST_DRIVE.md` (add the notification round trip)
- Modify: `HANDOVER.md` (test count)

**Interfaces:**
- Consumes: everything above.
- Produces: proof that migration `020` applies in real workerd and that emission works end to end.

- [ ] **Step 1: Add the endpoint to the smoke script**

In `scripts/smoke-local.mjs`, add `'/api/me/notifications',` to the `PRACTITIONER_APIS` array.

- [ ] **Step 2: Write the round-trip verifier**

```js
// scripts/verify-notifications.mjs
/** Proves notification emission end to end against real workerd. */
import { createHash } from 'node:crypto';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const admin = `wn_admin=${createHash('sha256').update('preview-admin').digest('hex')}`;

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

// Sign in as a practitioner.
const link = await (await fetch(`${BASE}/api/auth/request-link`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'sarah.whitfield@example.com' }),
})).json();
const verify = await fetch(link.devLink, { redirect: 'manual' });
const session = (verify.headers.getSetCookie() ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('wn_session'));
check('practitioner signed in', !!session);

const before = await (await fetch(`${BASE}/api/me/notifications`, { headers: { cookie: session } })).json();

// Admin publishes a toolkit item, which should notify.
const created = await (await fetch(`${BASE}/api/admin/toolkit`, {
  method: 'POST', headers: { cookie: admin, 'content-type': 'application/json' },
  body: JSON.stringify({
    title: `Notification probe ${Date.now()}`, type: 'protocol',
    description: 'Created by verify-notifications.mjs', audience: 'all',
    contentKind: 'link', url: 'https://example.org/probe', published: false,
  }),
})).json();
const id = created?.resource?.id ?? created?.id;
check('admin created an unpublished toolkit item', !!id, `#${id}`);

await fetch(`${BASE}/api/admin/toolkit/${id}`, {
  method: 'PATCH', headers: { cookie: admin, 'content-type': 'application/json' },
  body: JSON.stringify({ published: true }),
});

const after = await (await fetch(`${BASE}/api/me/notifications`, { headers: { cookie: session } })).json();
check('publishing produced a notification', after.unread > before.unread,
  `unread ${before.unread} -> ${after.unread}`);
check('the notification names the item', after.items[0]?.title?.includes('Notification probe'),
  after.items[0]?.title);
check('it links to the toolkit', after.items[0]?.href === '/toolkit');

// Mark all read.
await fetch(`${BASE}/api/me/notifications/read`, { method: 'POST', headers: { cookie: session } });
const cleared = await (await fetch(`${BASE}/api/me/notifications`, { headers: { cookie: session } })).json();
check('mark all read clears the count', cleared.unread === 0, `unread ${cleared.unread}`);

// Tidy up the probe item.
await fetch(`${BASE}/api/admin/toolkit/${id}`, { method: 'DELETE', headers: { cookie: admin } });

console.log(`\n${failures === 0 ? 'ALL NOTIFICATION CHECKS PASSED' : failures + ' FAILED'}`);
process.exit(failures ? 1 : 0);
```

> If `/api/admin/toolkit` returns a different body shape or has no `DELETE`, read the route
> in `app/api/admin/toolkit/` and adjust the **setup and teardown** to match. Do not weaken
> the four `check(...)` assertions.

- [ ] **Step 3: Verify in real workerd**

```bash
export PATH="/c/Users/UtkarshRawat/AppData/Local/node/node-v22.20.0-win-x64:$PATH"
npm run preview:cf
```

With the worker up on `:8787`:

```bash
node scripts/smoke-local.mjs
node scripts/verify-notifications.mjs
```
Expected: both fully green.

Confirm migration `020` applied against local D1 rather than only in vitest:

```bash
npx wrangler d1 execute practitioner-portal --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'"
```
Expected: one row.

- [ ] **Step 4: Check the panel in a browser**

1. Sign in at `http://localhost:8787/dashboard` as `sarah.whitfield@example.com`.
2. The bell sits beside the wordmark in the navy sidebar, with a terracotta badge.
3. Open it — the panel overlays to the right of the sidebar and is readable at 320px.
4. Click a notification — it navigates and the dot clears.
5. **Mark all read** — the badge disappears and survives a reload.
6. Narrow the window below `lg`: the bell moves into the navy top bar and the panel opens left-aligned without overflowing the viewport.

- [ ] **Step 5: Update docs and commit**

In `docs/LOCAL_TEST_DRIVE.md`, add to the admin↔practitioner table:

```markdown
| Toolkit/Lessons/Media → publish anything | The practitioner's sidebar bell gains an unread notification |
| Community → reply to someone's post as another practitioner | The post author is notified; replying to your own post is silent |
```

and under the automated sweep section:

```markdown
To prove notification emission specifically:

```bash
node scripts/verify-notifications.mjs
```
```

In `HANDOVER.md`, update the test count from 502 to the new total.

```bash
git add scripts/smoke-local.mjs scripts/verify-notifications.mjs docs/LOCAL_TEST_DRIVE.md HANDOVER.md
git commit -m "docs(notifications): smoke coverage and the publish round trip"
```

---

## Self-Review

**Spec coverage:** §2 data model → Task 1. §3 all four emit seams, the three fan-out rules and the idempotence guard → Task 2. §4 both routes and the session-not-body rule → Task 3. §5 bell, panel, 60s polling → Task 4. §6 tests → Tasks 1–3. §7 gates including `preview:cf` → Task 5. §8 out-of-scope items appear nowhere.

**One spec deviation, flagged at the top:** §3 says audience gating applies at fan-out. It can only apply to `toolkit_resources` and `pathways`; `lessons` and `media` have no `audience` column, so those notify all approved practitioners. Task 2's tests assert audience gating on toolkit only.

**Placeholder scan:** no TBDs. Every code step is runnable. Three places carry an explicit "if the real signature differs, adjust the setup, not the assertions" note rather than a vague instruction.

**Type consistency:** `NotificationKind` and `Notification` are defined in Task 1 and used unchanged in Tasks 3–4. `notifyPractitioners` / `listNotifications` / `unreadNotificationCount` / `markNotificationsRead` keep identical signatures throughout. The client `Item` interface in Task 4 mirrors the `Notification` fields the API returns (`readAt`, `createdAt` camelCase, as `listNotifications` maps them).

**Known follow-up, out of scope:** every publish notifies every eligible practitioner, so a heavy content week is noisy. Batching or per-kind preferences would be the answer if that becomes a real complaint — deliberately not built now.
