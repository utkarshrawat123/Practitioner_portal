# Saved Items / "My Clinic" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a practitioner save a toolkit resource, a media resource or a lesson, and find everything they saved on one `/my-clinic` page.

**Architecture:** One polymorphic `saved_items` table following the `pathway_modules` `(content_kind, content_id)` precedent already in the schema. Reads join back to the source tables so deleted, unpublished or newly-inaccessible items simply stop appearing. A single `/api/me/saved` route serves both the hydrated list and the lightweight refs the list pages need to light up their toggles.

**Tech Stack:** Next.js 15 App Router on Cloudflare Workers via OpenNext, TypeScript, libSQL/D1, vitest.

## Spec correction — read this before Task 2

The spec (`docs/superpowers/specs/2026-08-25-saved-items-my-clinic-design.md` §3) says
*"`toolkit_resources` and `media` carry `audience`"*. **That is wrong about `media`.**
Verified against the schema:

| Table | Gating column(s) |
|---|---|
| `toolkit_resources` | `audience` **and** `published` (`lib/migrations.ts:89`) |
| `media` | `published` only — **no `audience` column** (`lib/db.ts:171`) |
| `lessons` | `status = 'published'` only — no `audience` column |

So the read rule is: **audience re-gating applies to toolkit rows only**; media and lessons
are gated on `published` / `status`. Do not write a test asserting audience gating on media —
it would be asserting a column that does not exist. The spec's *principle* still stands:
re-check access on read, never trust it from save time.

## Global Constraints

- **Branch:** `feat/saved-items`, already cut from `cloudflare-migration` and carrying the spec commit.
- **Node is not on PATH in tool shells.** Every shell starts with:
  `export PATH="/c/Users/UtkarshRawat/AppData/Local/node/node-v22.20.0-win-x64:$PATH"`
- **TDD, always.** Failing test first, then the minimal implementation.
- **Gates before "done":** `npm test` (baseline **477 passing / 104 files**) AND `npm run build`.
  This adds a migration and an API route, so `npm run preview:cf` is also required (Task 6).
- **`npm run build` corrupts `.next` if a dev server is running.** Stop dev first.
- **`rm -rf .open-next` fails with `EBUSY`** while any `workerd`/`wrangler` process lives — kill them first.
- **Mock-until-keyed is sacred.** This feature has no keyed path; it must never require a secret.
- **Style:** use the brand primitives in `components/ui/index.tsx` (`Card`, `Label`, `Pill`, `Button`, `Empty`, `Loading`). No `border border-stone`, no square uppercase buttons — the whole app was just reskinned off those.
- **Naming:** the column is `item_type`, **not** `content_kind`. `content_kind` already means the payload kind (`file`/`link`/`text`) on toolkit/media and the entity kind on `pathway_modules`; a third meaning would make the schema harder to read.

---

### Task 1: Migration + save/unsave/refs helpers

**Files:**
- Modify: `lib/migrations.ts` (append migration `019_saved_items` to the `MIGRATIONS` array)
- Modify: `lib/db.ts` (add the type + three helpers near the `registerForEvent` group, ~line 1590)
- Test: `tests/saved-items-db.test.ts`

**Interfaces:**
- Consumes: `run`, `all` (module-private helpers in `lib/db.ts`), `num`.
- Produces:
  - `export type SavedItemType = 'toolkit' | 'media' | 'lesson'`
  - `saveItem(practitionerId: number, itemType: SavedItemType, itemId: number): Promise<void>`
  - `unsaveItem(practitionerId: number, itemType: SavedItemType, itemId: number): Promise<void>`
  - `savedItemRefs(practitionerId: number): Promise<{ itemType: SavedItemType; itemId: number }[]>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/saved-items-db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-saved-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function makePractitioner(email: string) {
  const { insertApplication } = await import('@/lib/db');
  return insertApplication({
    name: 'Saver Test', email, registerBody: 'BANT',
    registerNumber: '123', qualificationStatus: 'qualified',
  });
}

describe('019_saved_items migration', () => {
  it('creates the saved_items table', async () => {
    const { execForTests } = await import('@/lib/db');
    const rows = (await execForTests("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((r) => r.name as string);
    expect(rows).toContain('saved_items');
  });
});

describe('saveItem / unsaveItem / savedItemRefs', () => {
  it('saving twice yields exactly one row', async () => {
    const { saveItem, savedItemRefs } = await import('@/lib/db');
    const p = await makePractitioner('save1@example.com');
    await saveItem(p.id, 'toolkit', 7);
    await saveItem(p.id, 'toolkit', 7);
    const refs = await savedItemRefs(p.id);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ itemType: 'toolkit', itemId: 7 });
  });

  it('unsaves, and unsaving something never saved is a no-op', async () => {
    const { saveItem, unsaveItem, savedItemRefs } = await import('@/lib/db');
    const p = await makePractitioner('save2@example.com');
    await saveItem(p.id, 'lesson', 3);
    await unsaveItem(p.id, 'lesson', 3);
    expect(await savedItemRefs(p.id)).toHaveLength(0);
    await expect(unsaveItem(p.id, 'lesson', 999)).resolves.toBeUndefined();
  });

  it('keeps each practitioner’s saves separate', async () => {
    const { saveItem, savedItemRefs } = await import('@/lib/db');
    const a = await makePractitioner('a@example.com');
    const b = await makePractitioner('b@example.com');
    await saveItem(a.id, 'media', 1);
    await saveItem(b.id, 'media', 2);
    expect(await savedItemRefs(a.id)).toEqual([{ itemType: 'media', itemId: 1 }]);
    expect(await savedItemRefs(b.id)).toEqual([{ itemType: 'media', itemId: 2 }]);
  });

  it('the same item id in different types does not collide', async () => {
    const { saveItem, savedItemRefs } = await import('@/lib/db');
    const p = await makePractitioner('save3@example.com');
    await saveItem(p.id, 'toolkit', 5);
    await saveItem(p.id, 'media', 5);
    await saveItem(p.id, 'lesson', 5);
    expect(await savedItemRefs(p.id)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/saved-items-db.test.ts`
Expected: FAIL — `saved_items` is not a table and `saveItem` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to the `MIGRATIONS` array in `lib/migrations.ts`, after `018_referral_v2`:

```ts
  {
    // "My Clinic" saved items. One polymorphic table following the
    // pathway_modules (content_kind, content_id) precedent.
    //
    // `item_type` is deliberately NOT called content_kind: that name already
    // means the payload kind (file/link/text) on toolkit_resources and media.
    //
    // No FK on item_id — a deleted source row leaves an orphan, which the read
    // path drops via its join. Same trade pathway_modules already makes.
    id: '019_saved_items',
    sql: `
CREATE TABLE IF NOT EXISTS saved_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(practitioner_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_items_practitioner ON saved_items(practitioner_id);
`,
  },
```

Add to `lib/db.ts`, immediately after the `eventRegistrationCount` function (~line 1602):

```ts
/** The three content types a practitioner can save into My Clinic. */
export type SavedItemType = 'toolkit' | 'media' | 'lesson';

/** Idempotent — saving an already-saved item is a no-op, not an error. */
export async function saveItem(practitionerId: number, itemType: SavedItemType, itemId: number): Promise<void> {
  await run(
    `INSERT INTO saved_items (practitioner_id, item_type, item_id) VALUES (?, ?, ?)
     ON CONFLICT(practitioner_id, item_type, item_id) DO NOTHING`,
    [practitionerId, itemType, itemId]
  );
}

/** Removing something that was never saved is a no-op, not an error. */
export async function unsaveItem(practitionerId: number, itemType: SavedItemType, itemId: number): Promise<void> {
  await run(
    `DELETE FROM saved_items WHERE practitioner_id = ? AND item_type = ? AND item_id = ?`,
    [practitionerId, itemType, itemId]
  );
}

/** Lightweight refs so list pages can light up their save toggles in one call. */
export async function savedItemRefs(
  practitionerId: number
): Promise<{ itemType: SavedItemType; itemId: number }[]> {
  const rows = await all(
    `SELECT item_type, item_id FROM saved_items WHERE practitioner_id = ?`,
    [practitionerId]
  );
  return rows.map((r) => ({ itemType: r.item_type as SavedItemType, itemId: num(r.item_id) }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/saved-items-db.test.ts tests/migrations.test.ts`
Expected: PASS. `tests/migrations.test.ts` needs no edit — it asserts the recorded set equals `MIGRATIONS`, so `019` is covered automatically.

- [ ] **Step 5: Commit**

```bash
git add lib/migrations.ts lib/db.ts tests/saved-items-db.test.ts
git commit -m "feat(saved-items): migration 019 + save/unsave/refs helpers"
```

---

### Task 2: `listSavedItems` — the hydrated read with re-gating

**Files:**
- Modify: `lib/db.ts` (add below `savedItemRefs`)
- Test: `tests/saved-items-read.test.ts`

**Interfaces:**
- Consumes: `SavedItemType`, `saveItem` (Task 1); `hasAccess` from `@/lib/access`, already imported in `lib/db.ts`.
- Produces:
  - `export interface SavedItem { itemType: SavedItemType; itemId: number; savedAt: string; title: string; description: string | null; href: string; meta: string | null }`
  - `listSavedItems(practitionerId: number, qualificationStatus: QualificationStatus | null): Promise<SavedItem[]>`

This is where the substance is. Three rules, each with a test:

1. **Orphans vanish** — a saved row whose source record was deleted is skipped.
2. **Unpublished vanish** — `published = 0` (toolkit/media) or `status != 'published'` (lessons) is skipped.
3. **Audience re-checked on read** — a `qualified`-only toolkit row disappears if the practitioner is no longer qualified. **Toolkit only** — see the spec correction at the top of this plan.

- [ ] **Step 1: Write the failing test**

```ts
// tests/saved-items-read.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-saved-read-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function practitioner(email: string) {
  const { insertApplication } = await import('@/lib/db');
  return insertApplication({
    name: 'Reader', email, registerBody: 'BANT',
    registerNumber: '321', qualificationStatus: 'qualified',
  });
}

async function toolkitRow(audience: 'all' | 'qualified' | 'student', published = 1) {
  const { execForTests } = await import('@/lib/db');
  await execForTests(
    `INSERT INTO toolkit_resources (title, type, description, audience, content_kind, url, published)
     VALUES ('Iron guide', 'protocol', 'Ferritin in context', ?, 'link', 'https://example.org/x', ?)`,
    [audience, published]
  );
  const row = await execForTests(`SELECT last_insert_rowid() AS id`);
  return Number(row.rows[0].id);
}

describe('listSavedItems', () => {
  it('returns a saved toolkit item with title and description', async () => {
    const { saveItem, listSavedItems } = await import('@/lib/db');
    const p = await practitioner('r1@example.com');
    const id = await toolkitRow('all');
    await saveItem(p.id, 'toolkit', id);

    const items = await listSavedItems(p.id, 'qualified');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Iron guide');
    expect(items[0].itemType).toBe('toolkit');
    expect(items[0].itemId).toBe(id);
  });

  it('drops an orphan whose source row was deleted', async () => {
    const { saveItem, listSavedItems, execForTests } = await import('@/lib/db');
    const p = await practitioner('r2@example.com');
    const id = await toolkitRow('all');
    await saveItem(p.id, 'toolkit', id);
    await execForTests(`DELETE FROM toolkit_resources WHERE id = ?`, [id]);

    expect(await listSavedItems(p.id, 'qualified')).toHaveLength(0);
  });

  it('drops an item unpublished after it was saved', async () => {
    const { saveItem, listSavedItems, execForTests } = await import('@/lib/db');
    const p = await practitioner('r3@example.com');
    const id = await toolkitRow('all');
    await saveItem(p.id, 'toolkit', id);
    await execForTests(`UPDATE toolkit_resources SET published = 0 WHERE id = ?`, [id]);

    expect(await listSavedItems(p.id, 'qualified')).toHaveLength(0);
  });

  it('re-applies audience gating on read when qualification changes', async () => {
    const { saveItem, listSavedItems } = await import('@/lib/db');
    const p = await practitioner('r4@example.com');
    const id = await toolkitRow('qualified');
    await saveItem(p.id, 'toolkit', id);

    // Visible while qualified…
    expect(await listSavedItems(p.id, 'qualified')).toHaveLength(1);
    // …and gone once they are not. Gating at save time would have leaked this.
    expect(await listSavedItems(p.id, 'student')).toHaveLength(0);
  });

  it('returns newest saves first', async () => {
    const { saveItem, listSavedItems, execForTests } = await import('@/lib/db');
    const p = await practitioner('r5@example.com');
    const first = await toolkitRow('all');
    const second = await toolkitRow('all');
    await saveItem(p.id, 'toolkit', first);
    await saveItem(p.id, 'toolkit', second);
    // Force a distinct timestamp so ordering is deterministic rather than tie-broken.
    await execForTests(
      `UPDATE saved_items SET created_at = '2020-01-01 00:00:00' WHERE item_id = ?`,
      [first]
    );

    const items = await listSavedItems(p.id, 'qualified');
    expect(items.map((i) => i.itemId)).toEqual([second, first]);
  });

  it('returns an empty array for a practitioner who has saved nothing', async () => {
    const { listSavedItems } = await import('@/lib/db');
    const p = await practitioner('r6@example.com');
    expect(await listSavedItems(p.id, 'qualified')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/saved-items-read.test.ts`
Expected: FAIL — `listSavedItems` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `lib/db.ts` directly below `savedItemRefs`:

```ts
export interface SavedItem {
  itemType: SavedItemType;
  itemId: number;
  savedAt: string;
  title: string;
  description: string | null;
  /** Where the card links to. */
  href: string;
  /** Small type line under the title, e.g. "Protocol" or "Video". */
  meta: string | null;
}

/**
 * Hydrated saved items, newest first.
 *
 * Access is re-checked HERE, on read, never trusted from save time: a
 * qualified-only toolkit item must disappear if the practitioner stops being
 * qualified. Deleted and unpublished rows drop out the same way — the join
 * simply does not return them, so a stale save renders as nothing rather than
 * as a broken card.
 *
 * Only toolkit_resources carries an `audience` column; media and lessons gate
 * on published/status alone.
 */
export async function listSavedItems(
  practitionerId: number,
  qualificationStatus: QualificationStatus | null
): Promise<SavedItem[]> {
  const saved = await all(
    `SELECT item_type, item_id, created_at FROM saved_items
     WHERE practitioner_id = ? ORDER BY created_at DESC, id DESC`,
    [practitionerId]
  );
  if (saved.length === 0) return [];

  const practitioner = qualificationStatus ? { qualificationStatus } : null;
  const out: SavedItem[] = [];

  for (const s of saved) {
    const itemType = s.item_type as SavedItemType;
    const itemId = num(s.item_id);
    const savedAt = String(s.created_at);

    if (itemType === 'toolkit') {
      const r = await one(`SELECT * FROM toolkit_resources WHERE id = ? AND published = 1`, [itemId]);
      if (!r) continue;
      const resource = rowToToolkit(r);
      if (!hasAccess(practitioner, resource)) continue;
      out.push({
        itemType, itemId, savedAt,
        title: resource.title,
        description: resource.description,
        href: '/toolkit',
        meta: resource.type,
      });
    } else if (itemType === 'media') {
      const r = await one(`SELECT * FROM media WHERE id = ? AND published = 1`, [itemId]);
      if (!r) continue;
      const media = rowToMedia(r);
      out.push({
        itemType, itemId, savedAt,
        title: media.title,
        description: media.description,
        href: media.url,
        meta: media.type,
      });
    } else if (itemType === 'lesson') {
      const r = await one(`SELECT * FROM lessons WHERE id = ? AND status = 'published'`, [itemId]);
      if (!r) continue;
      const lesson = rowToLesson(r);
      out.push({
        itemType, itemId, savedAt,
        title: lesson.title,
        description: lesson.summary,
        href: '/library',
        meta: 'Lesson',
      });
    }
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/saved-items-read.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts tests/saved-items-read.test.ts
git commit -m "feat(saved-items): hydrated read that re-checks access on every load"
```

---

### Task 3: The `/api/me/saved` route

**Files:**
- Create: `app/api/me/saved/route.ts`
- Test: `tests/api-me-saved.test.ts`

**Interfaces:**
- Consumes: `saveItem`, `unsaveItem`, `savedItemRefs`, `listSavedItems`, `SavedItemType` (Tasks 1–2); `getSessionPractitioner` from `@/lib/practitionerAuth`.
- Produces: `GET` → `{ refs, items }`; `POST` `{ itemType, itemId }` → `{ ok: true }`; `DELETE` `{ itemType, itemId }` → `{ ok: true }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/api-me-saved.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api-me-saved.test.ts`
Expected: FAIL — cannot resolve `@/app/api/me/saved/route`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/api/me/saved/route.ts
import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { saveItem, unsaveItem, savedItemRefs, listSavedItems, type SavedItemType } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ALLOWED: SavedItemType[] = ['toolkit', 'media', 'lesson'];

/** Validates the body, so arbitrary strings can never reach the item_type column. */
async function parseBody(req: Request): Promise<{ itemType: SavedItemType; itemId: number } | null> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return null;
  }
  const { itemType, itemId } = (body ?? {}) as { itemType?: unknown; itemId?: unknown };
  if (typeof itemType !== 'string' || !ALLOWED.includes(itemType as SavedItemType)) return null;
  if (typeof itemId !== 'number' || !Number.isInteger(itemId) || itemId <= 0) return null;
  return { itemType: itemType as SavedItemType, itemId };
}

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const [refs, items] = await Promise.all([
    savedItemRefs(p.id),
    listSavedItems(p.id, p.qualificationStatus),
  ]);
  return NextResponse.json({ refs, items });
}

export async function POST(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const parsed = await parseBody(req);
  if (!parsed) return NextResponse.json({ error: 'Invalid itemType or itemId' }, { status: 400 });
  await saveItem(p.id, parsed.itemType, parsed.itemId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const parsed = await parseBody(req);
  if (!parsed) return NextResponse.json({ error: 'Invalid itemType or itemId' }, { status: 400 });
  await unsaveItem(p.id, parsed.itemType, parsed.itemId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api-me-saved.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/me/saved/route.ts tests/api-me-saved.test.ts
git commit -m "feat(saved-items): /api/me/saved with validated item types"
```

---

### Task 4: `SaveButton` and the three list pages

**Files:**
- Create: `components/SaveButton.tsx`
- Create: `lib/useSavedRefs.ts`
- Modify: `components/ToolkitApp.tsx` (`ResourceCard`)
- Modify: `components/ResourcesApp.tsx` (passes a save control into `MediaCard`'s `children`)
- Modify: `components/LibraryApp.tsx` (lesson list rows)

**Interfaces:**
- Consumes: the `/api/me/saved` route (Task 3).
- Produces:
  - `SaveButton({ itemType, itemId, saved, onToggle }: { itemType: SavedItemType; itemId: number; saved: boolean; onToggle: (nowSaved: boolean) => void })`
  - `useSavedRefs(): { isSaved(t, id): boolean; setSaved(t, id, v): void; ready: boolean }`

There is **no component-test infrastructure** in this repo (104 test files, all db/API level, no testing-library or jsdom) and this task does **not** add any. These changes are covered by the type checker, `npm run build`, and the browser pass in Task 6.

- [ ] **Step 1: Create the shared hook**

```ts
// lib/useSavedRefs.ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SavedItemType } from '@/lib/db';

const key = (t: SavedItemType, id: number) => `${t}:${id}`;

/**
 * Fetches the practitioner's saved refs once, and tracks them locally as the
 * user toggles. Lives in its own hook so all three list pages share one
 * request shape and one source of truth.
 */
export function useSavedRefs() {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/me/saved')
      .then((r) => (r.ok ? r.json() : { refs: [] }))
      .then((b: { refs: { itemType: SavedItemType; itemId: number }[] }) => {
        if (!live) return;
        setKeys(new Set((b.refs ?? []).map((r) => key(r.itemType, r.itemId))));
        setReady(true);
      })
      .catch(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  const isSaved = useCallback((t: SavedItemType, id: number) => keys.has(key(t, id)), [keys]);

  const setSaved = useCallback((t: SavedItemType, id: number, value: boolean) => {
    setKeys((prev) => {
      const next = new Set(prev);
      if (value) next.add(key(t, id)); else next.delete(key(t, id));
      return next;
    });
  }, []);

  return { isSaved, setSaved, ready };
}
```

- [ ] **Step 2: Create `SaveButton`**

```tsx
// components/SaveButton.tsx
'use client';

import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import type { SavedItemType } from '@/lib/db';

/**
 * Optimistic save toggle. Reverts on a failed request — the icon must never
 * claim something is saved when the server disagreed.
 */
export default function SaveButton({
  itemType,
  itemId,
  saved,
  onToggle,
}: {
  itemType: SavedItemType;
  itemId: number;
  saved: boolean;
  onToggle: (nowSaved: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !saved;
    setBusy(true);
    onToggle(next); // optimistic
    try {
      const res = await fetch('/api/me/saved', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType, itemId }),
      });
      if (!res.ok) onToggle(!next); // revert
    } catch {
      onToggle(!next); // revert
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      title={saved ? 'Saved to My Clinic' : 'Save to My Clinic'}
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] transition-colors disabled:opacity-50 ${
        saved ? 'bg-terracotta-mid text-white' : 'bg-blush text-ink2 hover:text-ink'
      }`}
    >
      <Bookmark className="h-3.5 w-3.5" strokeWidth={1.8} fill={saved ? 'currentColor' : 'none'} />
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}
```

- [ ] **Step 3: Wire it into `ToolkitApp`**

In `components/ToolkitApp.tsx`, add the imports:

```tsx
import SaveButton from '@/components/SaveButton';
import { useSavedRefs } from '@/lib/useSavedRefs';
```

Change `ResourceCard` to accept the save state and render the button next to the type pill:

```tsx
function ResourceCard({
  r, saved, onToggle,
}: { r: Resource; saved: boolean; onToggle: (v: boolean) => void }) {
```

Replace the opening pill row:

```tsx
      <div className="flex items-start justify-between gap-3">
        <Pill tone="sage">{TYPE_LABELS[r.type] ?? r.type}</Pill>
        <SaveButton itemType="toolkit" itemId={r.id} saved={saved} onToggle={onToggle} />
      </div>
```

In the `ToolkitApp` component body add `const { isSaved, setSaved } = useSavedRefs();`, and change the map to:

```tsx
            {resources.map((r) => (
              <ResourceCard
                key={r.id}
                r={r}
                saved={isSaved('toolkit', r.id)}
                onToggle={(v) => setSaved('toolkit', r.id, v)}
              />
            ))}
```

- [ ] **Step 4: Wire it into `ResourcesApp` and `LibraryApp`**

In `components/ResourcesApp.tsx` add the same two imports, add `const { isSaved, setSaved } = useSavedRefs();` to the component body, and pass the button through `MediaCard`'s existing `children` slot:

```tsx
          {rows.map((m) => (
            <MediaCard key={m.id} item={m}>
              <div className="mt-3">
                <SaveButton
                  itemType="media"
                  itemId={m.id}
                  saved={isSaved('media', m.id)}
                  onToggle={(v) => setSaved('media', m.id, v)}
                />
              </div>
            </MediaCard>
          ))}
```

In `components/LibraryApp.tsx` add the same two imports and `const { isSaved, setSaved } = useSavedRefs();` to `LibraryApp`. The lesson row is a `<button>`, so the save control must **not** nest inside it — put it in the row's flex header beside the "Completed" pill, wrapped so its click does not open the lesson:

```tsx
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {completed.has(l.id) && <Pill tone="outline">Completed ✓</Pill>}
                    <span
                      role="presentation"
                      onClick={(e) => { e.stopPropagation(); }}
                    >
                      <SaveButton
                        itemType="lesson"
                        itemId={l.id}
                        saved={isSaved('lesson', l.id)}
                        onToggle={(v) => setSaved('lesson', l.id, v)}
                      />
                    </span>
                  </div>
```

Change the lesson row from `<button>` to `<div role="button" tabIndex={0} onClick={...} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpenId(l.id); }}>` so a nested button is valid HTML. **A `<button>` inside a `<button>` is invalid and React will warn** — this is why the element changes.

- [ ] **Step 5: Typecheck, build, commit**

Run: `npx tsc --noEmit` — expect no errors outside `tests/`.
Run: `npm run build` — expect a clean build.

```bash
git add components/SaveButton.tsx lib/useSavedRefs.ts components/ToolkitApp.tsx components/ResourcesApp.tsx components/LibraryApp.tsx
git commit -m "feat(saved-items): save toggle on toolkit, resources and lessons"
```

---

### Task 5: The `/my-clinic` page and its nav entry

**Files:**
- Create: `app/my-clinic/page.tsx`
- Create: `components/MyClinicApp.tsx`
- Modify: `lib/nav.ts` (add to the `My Clinic` section and to `ALL_PRACTITIONER_ROUTES`)
- Test: `tests/nav.test.ts` already asserts every route in `ALL_PRACTITIONER_ROUTES` appears in the sidebar — adding the route there makes that test cover this page automatically.

**Interfaces:**
- Consumes: `GET /api/me/saved` (Task 3) returning `{ refs, items }` where `items` are `SavedItem`.
- Produces: the `/my-clinic` route.

- [ ] **Step 1: Add the route to the nav and watch the existing test fail**

In `lib/nav.ts`, add to the `My Clinic` section items, first position:

```ts
      { label: 'Saved', href: '/my-clinic' },
```

and add `'/my-clinic',` to `ALL_PRACTITIONER_ROUTES`.

Run: `npx vitest run tests/nav.test.ts`
Expected: PASS — because the route is in both lists. (If you add it to `ALL_PRACTITIONER_ROUTES` only, the "surfaces every practitioner route" test fails, which is exactly the guard working.)

- [ ] **Step 2: Create the page**

```tsx
// app/my-clinic/page.tsx
import MyClinicApp from '@/components/MyClinicApp';

export const metadata = { title: 'My Clinic | Wild Nutrition Practitioner Community' };

export default function Page() {
  return <MyClinicApp />;
}
```

- [ ] **Step 3: Create the client app**

```tsx
// components/MyClinicApp.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SavedItem, SavedItemType } from '@/lib/db';
import { Button, Card, Empty, Label, Loading, Pill } from '@/components/ui';

const SECTIONS: { type: SavedItemType; title: string; browseHref: string; browseLabel: string }[] = [
  { type: 'toolkit', title: 'Clinical Toolkit', browseHref: '/toolkit', browseLabel: 'Browse the toolkit' },
  { type: 'media', title: 'Resources', browseHref: '/resources', browseLabel: 'Browse resources' },
  { type: 'lesson', title: 'Lessons', browseHref: '/library', browseLabel: 'Browse lessons' },
];

export default function MyClinicApp() {
  const [items, setItems] = useState<SavedItem[] | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/me/saved');
    if (r.status === 401) { setAuthed(false); return; }
    setAuthed(true);
    setItems((await r.json()).items);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(item: SavedItem) {
    setItems((prev) => (prev ?? []).filter((i) => !(i.itemType === item.itemType && i.itemId === item.itemId)));
    await fetch('/api/me/saved', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemType: item.itemType, itemId: item.itemId }),
    });
    load();
  }

  if (authed === false) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-heading text-[34px] text-ink">My Clinic</h1>
        <p className="mt-3 text-ink2/75">Please <a href="/dashboard" className="text-terracotta underline">sign in</a>.</p>
      </div>
    );
  }

  const total = items?.length ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10 lg:py-12">
      <Label>My Clinic</Label>
      <h1 className="mt-2 font-heading text-[34px] leading-[1.15] tracking-[-0.01em] text-ink lg:text-[42px]">
        Saved for clinic
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink2/75">
        Everything you’ve saved, in one place — ready for your next consultation.
      </p>

      {items === null && <Loading />}

      {items !== null && total === 0 && (
        <div className="mt-8 space-y-4">
          <Empty>
            Nothing saved yet. Look for the <strong>Save</strong> button on toolkit items,
            resources and lessons.
          </Empty>
          <div className="flex flex-wrap justify-center gap-3">
            {SECTIONS.map((s) => (
              <Button key={s.type} href={s.browseHref}>{s.browseLabel}</Button>
            ))}
          </div>
        </div>
      )}

      {items !== null && total > 0 && (
        <div className="mt-10 space-y-11">
          {SECTIONS.map((section) => {
            const rows = items.filter((i) => i.itemType === section.type);
            if (rows.length === 0) return null;
            return (
              <section key={section.type}>
                <h2 className="font-heading text-[22px] leading-tight text-ink lg:text-[25px]">
                  {section.title}
                </h2>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  {rows.map((item) => (
                    <Card key={`${item.itemType}:${item.itemId}`} className="flex flex-col p-6">
                      {item.meta && <div><Pill tone="sage">{item.meta}</Pill></div>}
                      <p className="mt-3 font-heading text-[19px] leading-snug text-ink">{item.title}</p>
                      {item.description && (
                        <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-ink2/70">
                          {item.description}
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Button href={item.href} newTab={item.href.startsWith('http')}>Open</Button>
                        <button
                          type="button"
                          onClick={() => remove(item)}
                          className="rounded-pill px-3 py-1.5 text-[13px] text-ink2/60 transition-colors hover:text-terracotta"
                        >
                          Remove
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the gates**

Run: `npm test` — expect all green, **around 489 tests** (477 baseline + ~12 added).
Run: `npm run build` — expect a clean build.

- [ ] **Step 5: Commit**

```bash
git add app/my-clinic/page.tsx components/MyClinicApp.tsx lib/nav.ts
git commit -m "feat(saved-items): My Clinic page grouped by content type"
```

---

### Task 6: Workers verification, smoke sweep and docs

**Files:**
- Modify: `scripts/smoke-local.mjs` (add `/my-clinic` to `PRACTITIONER_PAGES` and `/api/me/saved` to `PRACTITIONER_APIS`)
- Modify: `docs/LOCAL_TEST_DRIVE.md` (add the save round-trip to the admin↔practitioner table)
- Modify: `HANDOVER.md` (test count)

**Interfaces:**
- Consumes: everything above.
- Produces: proof that migration `019` applies in real workerd, not just in vitest.

- [ ] **Step 1: Add the new surfaces to the smoke script**

In `scripts/smoke-local.mjs`, add `'/my-clinic',` to the `PRACTITIONER_PAGES` array and `'/api/me/saved',` to `PRACTITIONER_APIS`.

- [ ] **Step 2: Verify in real workerd**

```bash
export PATH="/c/Users/UtkarshRawat/AppData/Local/node/node-v22.20.0-win-x64:$PATH"
npm run preview:cf
```

With the worker up on `:8787`:

```bash
node scripts/smoke-local.mjs
```
Expected: every check passes, including the two new ones.

Then confirm migration `019` actually applied against local D1 rather than only in the test harness:

```bash
npx wrangler d1 execute practitioner-portal --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='saved_items'"
```
Expected: one row, `saved_items`.

- [ ] **Step 3: Verify the round trip in a browser**

1. Sign in at `http://localhost:8787/dashboard` as `sarah.whitfield@example.com`.
2. Open `/toolkit`, click **Save** on two items — the chip fills terracotta.
3. Open `/my-clinic` — both appear under **Clinical Toolkit**.
4. Click **Remove** on one — it disappears and does not come back on reload.
5. Open `/resources` and `/library`, save one of each, and confirm all three sections render.
6. In `/admin` → Toolkit, unpublish a saved item, then reload `/my-clinic` — **it should vanish**, proving the read-time gating from Task 2.

Step 6 is the one that matters most: it is the difference between a bookmark list and one that respects publication state.

- [ ] **Step 4: Update the docs**

In `docs/LOCAL_TEST_DRIVE.md`, add a row to the admin↔practitioner table:

```markdown
| Toolkit → unpublish a saved resource | `/my-clinic` — the saved card disappears |
```

In `HANDOVER.md`, update the test count from 477 to the new total.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-local.mjs docs/LOCAL_TEST_DRIVE.md HANDOVER.md
git commit -m "docs(saved-items): smoke coverage and the unpublish round trip"
```

---

## Self-Review

**Spec coverage:** §2 data model → Task 1. §3 server layer, both read rules → Task 2. §4 API incl. `itemType` validation → Task 3. §5 UI (SaveButton, three list pages, My Clinic page, nav) → Tasks 4–5. §6 tests → Tasks 1–3 (db + API; no component tests, as the spec states). §7 gates incl. `preview:cf` → Task 6. §8 out-of-scope items are not implemented anywhere in this plan.

**One spec deviation, deliberate and flagged at the top:** the spec claims `media` carries an `audience` column. It does not. Audience re-gating therefore applies to toolkit rows only, and Task 2's tests assert exactly that rather than a column that does not exist.

**Placeholder scan:** no TBDs; every code step carries real, runnable code.

**Type consistency:** `SavedItemType` and `SavedItem` are defined in Tasks 1–2 and used with those exact names in Tasks 3–5. `saveItem`/`unsaveItem`/`savedItemRefs`/`listSavedItems` keep consistent signatures throughout. Prop names `itemType`/`itemId`/`saved`/`onToggle` are identical across `SaveButton` and all three call sites.

**One HTML correctness note carried into Task 4:** the lesson row is currently a `<button>`, and nesting `SaveButton` inside it would be invalid HTML. Task 4 converts that row to a keyboard-accessible `div[role="button"]` rather than silently nesting buttons.
