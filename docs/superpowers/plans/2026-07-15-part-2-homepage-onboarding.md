# Part 2 — Homepage, Welcome Onboarding & Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/dashboard` with the deck's homepage, add a once-per-practitioner cinematic Welcome experience, a context-aware top nav, and an admin screen to manage "What's New" cards.

**Architecture:** Next.js 14 App Router. A new server-side session helper lets the layout and page shells read the logged-in practitioner. Migration 008 adds `has_seen_welcome`. Homepage widgets get DB helpers + admin/practitioner APIs. The Welcome page is a client framer-motion component behind a server redirect gate. All content gating reuses Part 1's `hasAccess`.

**Tech Stack:** Next.js 14, TypeScript, `@libsql/client` (raw SQL, no ORM), Tailwind, zod, Vitest, plus new `framer-motion` + `lucide-react` + `next/font/google` (Fraunces, Inter).

## Global Constraints

- **Branch:** `part-2-homepage` (already created).
- **DB is raw parameterized SQL via `@libsql/client`** — no ORM. New tables/columns go in `lib/migrations.ts` as a new appended migration id; never edit a shipped migration. Async `one/all/run` helpers only.
- **Every `lib/db.ts` fn is `async`** — always `await`.
- **API routes** export `const dynamic = 'force-dynamic'`. Admin routes: `if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })`. Practitioner routes: `getSessionPractitioner(req)` + require `status === 'approved'`. Validate bodies with **zod**; wrap `req.json()` in try/catch → 400.
- **TDD**: failing test first. Keep `npm test` green (**183 passing** at start). Tests set `process.env.DB_PATH` to a temp file and call `resetDbForTests()` in `afterEach`.
- **Brand tokens (Tailwind):** `ink #191919`, `ink2`, `terracotta #a45248`, `cream #f8f6f3`, `sage`, `stone #e6e3df`, `forest #3a4f41`; `font-heading`. Page containers centered `mx-auto max-w-*`.
- **Never reference `care@wildnutrition.com`** anywhere. Contact = `utkarshrawatofficial@gmail.com`.
- **Welcome page palette (this page only, deliberate brand break):** bg `#16233F`, accent `#C1573D`, text `#F3EEE1` (secondary 60–70% opacity), card `#1E2C4C`. Fonts Fraunces + Inter via `next/font/google`. No video/photo/audio assets anywhere on that page.
- Commit after every task with the message shown in its final step.

---

## File map

**Create:**
- `lib/serverSession.ts` — `getServerSessionPractitioner()`.
- `components/SiteHeader.tsx` — context-aware header (server).
- `components/LogoutButton.tsx` — logout action (client).
- `components/ComingSoon.tsx` — branded placeholder.
- `components/WelcomeExperience.tsx` — cinematic client component.
- `components/AdminWidgets.tsx` — admin "What's New" manager (client).
- `app/onboarding/welcome/page.tsx` + `app/onboarding/welcome/fonts.ts`.
- `app/learning/page.tsx`, `app/toolkit/page.tsx`, `app/community/page.tsx`, `app/events/page.tsx`, `app/coming-soon/page.tsx` — stub routes.
- `app/api/admin/widgets/route.ts`, `app/api/admin/widgets/[id]/route.ts`.
- `app/api/me/widgets/route.ts`, `app/api/me/seen-welcome/route.ts`.
- Tests: `tests/widgets-db.test.ts`, `tests/welcome-db.test.ts`, `tests/session-value.test.ts`, `tests/api-admin-widgets.test.ts`, `tests/api-me-widgets.test.ts`.

**Modify:**
- `package.json` — add deps.
- `lib/migrations.ts` — append `008_has_seen_welcome`.
- `lib/db.ts` — `Practitioner.hasSeenWelcome`, `rowToPractitioner`, `markSeenWelcome`, widget types + helpers, import `hasAccess`.
- `tests/migrations.test.ts` — add 008 assertions.
- `app/layout.tsx` — use `<SiteHeader/>`.
- `app/dashboard/page.tsx` — server redirect gate.
- `components/DashboardApp.tsx` — new homepage body.
- `components/AdminDashboard.tsx` — add "Homepage" tab.

---

## Task 1: Add dependencies

**Files:** Modify `package.json`.

- [ ] **Step 1: Install the two libraries**

Run:
```bash
cd "/Users/utkarshrawat/Wild Dash/practitioner-portal"
npm install framer-motion@^11 lucide-react@^0.400.0
```
Expected: `package.json` `dependencies` now include `framer-motion` and `lucide-react`; `package-lock.json` updated.

- [ ] **Step 2: Verify the build still compiles**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add framer-motion and lucide-react for Part 2"
```

---

## Task 2: Migration 008 — `has_seen_welcome`

**Files:**
- Modify: `lib/migrations.ts` (append to `MIGRATIONS`)
- Modify: `lib/db.ts` (`Practitioner` interface, `rowToPractitioner`, add `markSeenWelcome`)
- Test: `tests/migrations.test.ts` (add), `tests/welcome-db.test.ts` (create)

**Interfaces:**
- Produces: `Practitioner.hasSeenWelcome: boolean`; `markSeenWelcome(id: number): Promise<void>`.

- [ ] **Step 1: Write the failing migration test**

Add to `tests/migrations.test.ts` inside the `describe('migrations', …)` block:
```ts
  it('008 adds has_seen_welcome and backfills existing rows to 1', async () => {
    const { execForTests } = await import('@/lib/db');
    // Insert a practitioner BEFORE reading the column's backfilled state.
    const { insertApplication } = await import('@/lib/db');
    const p = await insertApplication({
      name: 'Old Row', email: 'old@example.com', registerBody: 'BANT',
      registerNumber: '999', qualificationStatus: 'qualified',
    });
    const cols = await execForTests('PRAGMA table_info(practitioners)');
    expect(cols.rows.map((r) => r.name as string)).toContain('has_seen_welcome');
    const row = await execForTests('SELECT has_seen_welcome FROM practitioners WHERE id = ?', [p.id]);
    // Migration backfills all rows present at migrate time to 1; brand-new inserts
    // after migration default to 0. Since migrations run on first getClient(), the
    // insert above happens post-migration, so it defaults to 0.
    expect(Number(row.rows[0].has_seen_welcome)).toBe(0);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/migrations.test.ts -t "008 adds has_seen_welcome"`
Expected: FAIL — no such column `has_seen_welcome`.

- [ ] **Step 3: Append the migration**

In `lib/migrations.ts`, add as the last element of `MIGRATIONS` (after `007_homepage_widgets`):
```ts
  {
    // Part 2: track whether a practitioner has seen the one-time Welcome experience.
    // Backfill existing rows to 1 so current accounts are not shown the takeover;
    // only sign-ups created after this migration default to 0 and see it once.
    id: '008_has_seen_welcome',
    sql: `
ALTER TABLE practitioners ADD COLUMN has_seen_welcome INTEGER NOT NULL DEFAULT 0;
UPDATE practitioners SET has_seen_welcome = 1;
`,
  },
```

- [ ] **Step 4: Add the field to the Practitioner type + mapping + helper in `lib/db.ts`**

In the `Practitioner` interface, add after `decidedBy: string | null;`:
```ts
  hasSeenWelcome: boolean;
```
In `rowToPractitioner`, add after the `decidedBy` line:
```ts
    hasSeenWelcome: num(row.has_seen_welcome) === 1,
```
Add this helper near the other practitioner write helpers (e.g. after `markApproved`):
```ts
export async function markSeenWelcome(id: number): Promise<void> {
  await run(`UPDATE practitioners SET has_seen_welcome = 1 WHERE id = ?`, [id]);
}
```

- [ ] **Step 5: Write the welcome-db test**

Create `tests/welcome-db.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-welcome-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('welcome flag', () => {
  it('new practitioner defaults hasSeenWelcome=false, markSeenWelcome flips it', async () => {
    const { insertApplication, getPractitioner, markSeenWelcome } = await import('@/lib/db');
    const p = await insertApplication({
      name: 'Nina New', email: 'nina@example.com', registerBody: 'BANT',
      registerNumber: '111', qualificationStatus: 'student',
    });
    expect(p.hasSeenWelcome).toBe(false);
    await markSeenWelcome(p.id);
    const after = await getPractitioner(p.id);
    expect(after!.hasSeenWelcome).toBe(true);
  });
});
```

- [ ] **Step 6: Run both tests + the full suite**

Run: `npx vitest run tests/migrations.test.ts tests/welcome-db.test.ts`
Expected: PASS.
Run: `npm test`
Expected: all green (was 183; now higher). If any pre-existing test did an exact object-equality on a full `Practitioner`, update it to include `hasSeenWelcome`.

- [ ] **Step 7: Commit**

```bash
git add lib/migrations.ts lib/db.ts tests/migrations.test.ts tests/welcome-db.test.ts
git commit -m "feat: migration 008 has_seen_welcome + markSeenWelcome"
```

---

## Task 3: Homepage widget DB helpers

**Files:**
- Modify: `lib/db.ts` (types + helpers, import `hasAccess`)
- Test: `tests/widgets-db.test.ts` (create)

**Interfaces:**
- Produces:
  - `interface HomepageWidget { id; title; body; linkUrl; imageUrl; audience: Audience; position; published; createdAt }`
  - `interface HomepageWidgetInput { title; body?; linkUrl?; imageUrl?; audience?; position?; published? }`
  - `createHomepageWidget(w: HomepageWidgetInput): Promise<HomepageWidget>`
  - `getHomepageWidget(id): Promise<HomepageWidget | null>`
  - `listHomepageWidgets(): Promise<HomepageWidget[]>` (all, ordered)
  - `listPublishedWidgetsFor(q: QualificationStatus | null): Promise<HomepageWidget[]>` (published + audience-filtered)
  - `updateHomepageWidget(id, patch: Partial<HomepageWidgetInput>): Promise<HomepageWidget | null>`
  - `deleteHomepageWidget(id): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `tests/widgets-db.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-widgets-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('homepage widgets db', () => {
  it('creates, reads, lists (ordered by position), updates and deletes', async () => {
    const db = await import('@/lib/db');
    const a = await db.createHomepageWidget({ title: 'Card A', position: 2 });
    const b = await db.createHomepageWidget({ title: 'Card B', position: 1, body: 'hello', linkUrl: 'https://x.test/a' });
    expect(a.published).toBe(true);
    expect(a.audience).toBe('all');
    const list = await db.listHomepageWidgets();
    expect(list.map((w) => w.title)).toEqual(['Card B', 'Card A']); // position asc
    const upd = await db.updateHomepageWidget(a.id, { title: 'Card A2', published: false, position: 5 });
    expect(upd!.title).toBe('Card A2');
    expect(upd!.published).toBe(false);
    await db.deleteHomepageWidget(b.id);
    expect(await db.getHomepageWidget(b.id)).toBeNull();
  });

  it('listPublishedWidgetsFor hides unpublished and respects audience', async () => {
    const db = await import('@/lib/db');
    await db.createHomepageWidget({ title: 'Everyone', audience: 'all', position: 0 });
    await db.createHomepageWidget({ title: 'Qualified only', audience: 'qualified', position: 1 });
    await db.createHomepageWidget({ title: 'Student only', audience: 'student', position: 2 });
    const hidden = await db.createHomepageWidget({ title: 'Hidden', audience: 'all', position: 3 });
    await db.updateHomepageWidget(hidden.id, { published: false });

    const qualified = await db.listPublishedWidgetsFor('qualified');
    expect(qualified.map((w) => w.title)).toEqual(['Everyone', 'Qualified only']);
    const student = await db.listPublishedWidgetsFor('student');
    expect(student.map((w) => w.title)).toEqual(['Everyone', 'Student only']);
    const anon = await db.listPublishedWidgetsFor(null);
    expect(anon.map((w) => w.title)).toEqual(['Everyone']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/widgets-db.test.ts`
Expected: FAIL — `createHomepageWidget` is not a function.

- [ ] **Step 3: Implement the helpers**

At the top of `lib/db.ts`, add a runtime import (the existing `import type { … }` lines stay as-is):
```ts
import { hasAccess, type Audience } from '@/lib/access';
```
Add the types near the other interfaces (after `MediaRow`):
```ts
export interface HomepageWidget {
  id: number;
  title: string;
  body: string | null;
  linkUrl: string | null;
  imageUrl: string | null;
  audience: Audience;
  position: number;
  published: boolean;
  createdAt: string;
}

export interface HomepageWidgetInput {
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  imageUrl?: string | null;
  audience?: Audience;
  position?: number;
  published?: boolean;
}
```
Add the mapping + helpers near the media helpers (e.g. after `deleteMedia`):
```ts
function rowToWidget(row: Row): HomepageWidget {
  return {
    id: num(row.id),
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    linkUrl: (row.link_url as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    audience: ((row.audience as string | null) ?? 'all') as Audience,
    position: num(row.position),
    published: num(row.published) === 1,
    createdAt: row.created_at as string,
  };
}

export async function createHomepageWidget(w: HomepageWidgetInput): Promise<HomepageWidget> {
  const res = await run(
    `INSERT INTO homepage_widgets (title, body, link_url, image_url, audience, position, published)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      w.title, w.body ?? null, w.linkUrl ?? null, w.imageUrl ?? null,
      w.audience ?? 'all', w.position ?? 0, w.published === false ? 0 : 1,
    ]
  );
  return (await getHomepageWidget(res.lastInsertRowid))!;
}

export async function getHomepageWidget(id: number): Promise<HomepageWidget | null> {
  const row = await one(`SELECT * FROM homepage_widgets WHERE id = ?`, [id]);
  return row ? rowToWidget(row) : null;
}

export async function listHomepageWidgets(): Promise<HomepageWidget[]> {
  const rows = await all(`SELECT * FROM homepage_widgets ORDER BY position ASC, id ASC`);
  return rows.map(rowToWidget);
}

export async function listPublishedWidgetsFor(
  qualificationStatus: QualificationStatus | null
): Promise<HomepageWidget[]> {
  const rows = await all(
    `SELECT * FROM homepage_widgets WHERE published = 1 ORDER BY position ASC, id ASC`
  );
  const practitioner = qualificationStatus ? { qualificationStatus } : null;
  return rows.map(rowToWidget).filter((w) => hasAccess(practitioner, w));
}

export async function updateHomepageWidget(
  id: number,
  patch: Partial<HomepageWidgetInput>
): Promise<HomepageWidget | null> {
  const sets: string[] = [];
  const args: InValue[] = [];
  if (patch.title !== undefined) { sets.push('title = ?'); args.push(patch.title); }
  if (patch.body !== undefined) { sets.push('body = ?'); args.push(patch.body ?? null); }
  if (patch.linkUrl !== undefined) { sets.push('link_url = ?'); args.push(patch.linkUrl ?? null); }
  if (patch.imageUrl !== undefined) { sets.push('image_url = ?'); args.push(patch.imageUrl ?? null); }
  if (patch.audience !== undefined) { sets.push('audience = ?'); args.push(patch.audience); }
  if (patch.position !== undefined) { sets.push('position = ?'); args.push(patch.position); }
  if (patch.published !== undefined) { sets.push('published = ?'); args.push(patch.published ? 1 : 0); }
  if (sets.length > 0) {
    args.push(id);
    await run(`UPDATE homepage_widgets SET ${sets.join(', ')} WHERE id = ?`, args);
  }
  return getHomepageWidget(id);
}

export async function deleteHomepageWidget(id: number): Promise<void> {
  await run(`DELETE FROM homepage_widgets WHERE id = ?`, [id]);
}
```

- [ ] **Step 4: Run the test + full suite**

Run: `npx vitest run tests/widgets-db.test.ts`
Expected: PASS.
Run: `npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts tests/widgets-db.test.ts
git commit -m "feat: homepage widget db helpers with audience filtering"
```

---

## Task 4: Server session helper

**Files:**
- Create: `lib/serverSession.ts`
- Test: `tests/session-value.test.ts` (create) — locks the sign/verify contract the helper relies on.

**Interfaces:**
- Consumes: `verifySessionValue` / `createSessionValue` from `lib/practitionerAuth`; `getPractitioner` from `lib/db`.
- Produces: `getServerSessionPractitioner(): Promise<Practitioner | null>`.

- [ ] **Step 1: Write the failing contract test**

Create `tests/session-value.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createSessionValue, verifySessionValue } from '@/lib/practitionerAuth';

describe('session value round trip', () => {
  it('verifies a freshly signed value', () => {
    const value = createSessionValue(42);
    expect(verifySessionValue(value)).toBe(42);
  });
  it('rejects a tampered value', () => {
    const value = createSessionValue(42);
    const tampered = value.replace(/^42\./, '43.');
    expect(verifySessionValue(tampered)).toBeNull();
  });
  it('rejects an expired value', () => {
    const value = createSessionValue(42, Date.now() - 1000);
    expect(verifySessionValue(value)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it passes (contract already exists)**

Run: `npx vitest run tests/session-value.test.ts`
Expected: PASS (this locks the behaviour `getServerSessionPractitioner` depends on).

- [ ] **Step 3: Create the server helper**

Create `lib/serverSession.ts`:
```ts
import { cookies } from 'next/headers';
import { verifySessionValue } from '@/lib/practitionerAuth';
import { getPractitioner, type Practitioner } from '@/lib/db';

/**
 * Server-component/route counterpart to getSessionPractitioner(req): reads the
 * wn_session cookie via next/headers, verifies its HMAC, and resolves the row.
 * Used by the layout header and the dashboard/welcome page shells.
 */
export async function getServerSessionPractitioner(): Promise<Practitioner | null> {
  const value = cookies().get('wn_session')?.value;
  if (!value) return null;
  const id = verifySessionValue(value);
  return id ? getPractitioner(id) : null;
}
```

- [ ] **Step 4: Verify it type-checks**

Run: `npm run build`
Expected: build compiles (no usage yet; this confirms the import path + types).

- [ ] **Step 5: Commit**

```bash
git add lib/serverSession.ts tests/session-value.test.ts
git commit -m "feat: getServerSessionPractitioner server session helper"
```

---

## Task 5: Admin widget API routes

**Files:**
- Create: `app/api/admin/widgets/route.ts`, `app/api/admin/widgets/[id]/route.ts`
- Test: `tests/api-admin-widgets.test.ts` (create)

**Interfaces:**
- Consumes: `isAuthed`; widget db helpers from Task 3.
- Produces: `GET/POST /api/admin/widgets`, `PATCH/DELETE /api/admin/widgets/[id]`. Responses: `{ widgets }`, `{ widget }`, `{ ok: true }`, `{ error }`.

- [ ] **Step 1: Write the failing test**

Create `tests/api-admin-widgets.test.ts`:
```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/api-admin-widgets.test.ts`
Expected: FAIL — cannot find module `@/app/api/admin/widgets/route`.

- [ ] **Step 3: Implement the collection route**

Create `app/api/admin/widgets/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { createHomepageWidget, listHomepageWidgets } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(2000).optional().nullable(),
  linkUrl: z.string().url().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  audience: z.enum(['all', 'qualified', 'student']).optional(),
  position: z.number().int().optional(),
  published: z.boolean().optional(),
});

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  return NextResponse.json({ widgets: await listHomepageWidgets() });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  }
  const d = parsed.data;
  const widget = await createHomepageWidget({
    title: d.title,
    body: d.body ?? null,
    linkUrl: d.linkUrl ?? null,
    imageUrl: d.imageUrl ?? null,
    audience: d.audience,
    position: d.position,
    published: d.published,
  });
  return NextResponse.json({ widget }, { status: 201 });
}
```

- [ ] **Step 4: Implement the item route**

Create `app/api/admin/widgets/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { deleteHomepageWidget, getHomepageWidget, updateHomepageWidget } from '@/lib/db';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().max(2000).optional().nullable(),
  linkUrl: z.string().url().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  audience: z.enum(['all', 'qualified', 'student']).optional(),
  position: z.number().int().optional(),
  published: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  }
  const widget = await updateHomepageWidget(id, parsed.data);
  if (!widget) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ widget });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const existing = await getHomepageWidget(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await deleteHomepageWidget(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run the test + full suite**

Run: `npx vitest run tests/api-admin-widgets.test.ts`
Expected: PASS.
Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/widgets tests/api-admin-widgets.test.ts
git commit -m "feat: admin widget CRUD API routes"
```

---

## Task 6: Practitioner APIs — widgets feed + seen-welcome

**Files:**
- Create: `app/api/me/widgets/route.ts`, `app/api/me/seen-welcome/route.ts`
- Test: `tests/api-me-widgets.test.ts` (create)

**Interfaces:**
- Consumes: `getSessionPractitioner`; `listPublishedWidgetsFor`, `markSeenWelcome`.
- Produces: `GET /api/me/widgets` → `{ widgets }`; `POST /api/me/seen-welcome` → `{ ok: true }`. Both 401 unless approved.

- [ ] **Step 1: Write the failing test**

Create `tests/api-me-widgets.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-mewidgets-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved(qualificationStatus: 'qualified' | 'student') {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name: 'Jane Smith', email: `${qualificationStatus}@example.com`, registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus,
  });
  return markApproved(p.id, {
    affiliateCode: 'WN-SMITH-AB2C', affiliateLink: 'http://localhost:3100/r/WN-SMITH-AB2C',
    pendingSync: false, decidedBy: 'system',
  });
}
async function sessionCookie(id: number): Promise<string> {
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return sessionCookieHeader(id).split(';')[0];
}

describe('/api/me/widgets', () => {
  it('401s without a session', async () => {
    const { GET } = await import('@/app/api/me/widgets/route');
    expect((await GET(new Request('http://x/api/me/widgets'))).status).toBe(401);
  });

  it('returns only audience-appropriate published widgets', async () => {
    const p = await seedApproved('student');
    const db = await import('@/lib/db');
    await db.createHomepageWidget({ title: 'Everyone', audience: 'all', position: 0 });
    await db.createHomepageWidget({ title: 'Qualified only', audience: 'qualified', position: 1 });
    await db.createHomepageWidget({ title: 'Student only', audience: 'student', position: 2 });
    const cookie = await sessionCookie(p.id);
    const { GET } = await import('@/app/api/me/widgets/route');
    const res = await GET(new Request('http://x/api/me/widgets', { headers: { cookie } }));
    expect(res.status).toBe(200);
    expect((await res.json()).widgets.map((w: { title: string }) => w.title)).toEqual(['Everyone', 'Student only']);
  });
});

describe('/api/me/seen-welcome', () => {
  it('sets the flag for the session practitioner', async () => {
    const p = await seedApproved('qualified');
    const cookie = await sessionCookie(p.id);
    const { POST } = await import('@/app/api/me/seen-welcome/route');
    const res = await POST(new Request('http://x/api/me/seen-welcome', { method: 'POST', headers: { cookie } }));
    expect(res.status).toBe(200);
    const { getPractitioner } = await import('@/lib/db');
    expect((await getPractitioner(p.id))!.hasSeenWelcome).toBe(true);
  });

  it('401s without a session', async () => {
    const { POST } = await import('@/app/api/me/seen-welcome/route');
    expect((await POST(new Request('http://x/api/me/seen-welcome', { method: 'POST' }))).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/api-me-widgets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the widgets feed route**

Create `app/api/me/widgets/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { listPublishedWidgetsFor } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  return NextResponse.json({ widgets: await listPublishedWidgetsFor(p.qualificationStatus) });
}
```

- [ ] **Step 4: Implement the seen-welcome route**

Create `app/api/me/seen-welcome/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { markSeenWelcome } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  await markSeenWelcome(p.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run the test + full suite**

Run: `npx vitest run tests/api-me-widgets.test.ts`
Expected: PASS.
Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/api/me/widgets app/api/me/seen-welcome tests/api-me-widgets.test.ts
git commit -m "feat: practitioner widgets feed + seen-welcome API routes"
```

---

## Task 7: Admin "Homepage" tab UI

**Files:**
- Create: `components/AdminWidgets.tsx`
- Modify: `components/AdminDashboard.tsx` (register the tab)

**Interfaces:**
- Consumes: `/api/admin/widgets` (GET/POST), `/api/admin/widgets/[id]` (PATCH/DELETE).

- [ ] **Step 1: Create the AdminWidgets component**

Create `components/AdminWidgets.tsx`:
```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

interface Widget {
  id: number; title: string; body: string | null; linkUrl: string | null;
  imageUrl: string | null; audience: 'all' | 'qualified' | 'student';
  position: number; published: boolean; createdAt: string;
}

const empty = { title: '', body: '', linkUrl: '', imageUrl: '', audience: 'all' as const };
const label = 'text-xs uppercase tracking-[0.15em] text-ink2/70';
const input = 'mt-1 w-full border border-stone px-3 py-2 focus:border-terracotta focus:outline-none';

export default function AdminWidgets() {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [form, setForm] = useState({ ...empty });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/widgets');
    if (res.ok) setWidgets((await res.json()).widgets);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await fetch('/api/admin/widgets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        body: form.body || null,
        linkUrl: form.linkUrl || null,
        imageUrl: form.imageUrl || null,
        audience: form.audience,
        position: widgets.length,
      }),
    });
    setBusy(false);
    if (res.ok) { setForm({ ...empty }); load(); }
    else setError((await res.json()).error ?? 'Could not save');
  }

  async function patch(id: number, body: Record<string, unknown>) {
    await fetch(`/api/admin/widgets/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    load();
  }

  async function move(index: number, dir: -1 | 1) {
    const a = widgets[index];
    const b = widgets[index + dir];
    if (!a || !b) return;
    await patch(a.id, { position: b.position });
    await patch(b.id, { position: a.position });
  }

  async function remove(id: number) {
    if (!confirm('Delete this card?')) return;
    await fetch(`/api/admin/widgets/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-8">
      <form onSubmit={create} className="grid gap-4 border border-stone bg-white p-6 md:grid-cols-2">
        <div className="md:col-span-2"><span className={label}>What&apos;s New card</span></div>
        <label className="block"><span className={label}>Title</span>
          <input className={input} required value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label className="block"><span className={label}>Audience</span>
          <select className={input} value={form.audience}
            onChange={(e) => setForm({ ...form, audience: e.target.value as typeof form.audience })}>
            <option value="all">Everyone</option>
            <option value="qualified">Qualified only</option>
            <option value="student">Students only</option>
          </select></label>
        <label className="block md:col-span-2"><span className={label}>Body</span>
          <textarea className={input} rows={2} value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
        <label className="block"><span className={label}>Link URL (optional)</span>
          <input className={input} value={form.linkUrl}
            onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="https://…" /></label>
        <label className="block"><span className={label}>Image URL (optional)</span>
          <input className={input} value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" /></label>
        {error && <p className="text-sm text-terracotta md:col-span-2">{error}</p>}
        <div className="md:col-span-2">
          <button disabled={busy}
            className="bg-ink px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta disabled:opacity-60">
            {busy ? 'Saving…' : 'Add card'}
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {widgets.length === 0 && <p className="text-sm text-ink2/70">No cards yet.</p>}
        {widgets.map((w, i) => (
          <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 border border-stone bg-white p-4">
            <div className="min-w-0">
              <p className="font-heading text-lg text-ink">{w.title}
                {!w.published && <span className="ml-2 text-xs uppercase tracking-[0.15em] text-ink2/50">hidden</span>}
              </p>
              {w.body && <p className="truncate text-sm text-ink2/70">{w.body}</p>}
              <p className="mt-1 text-xs uppercase tracking-[0.15em] text-ink2/50">Audience: {w.audience}</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="border border-stone px-2 py-1 disabled:opacity-40">↑</button>
              <button onClick={() => move(i, 1)} disabled={i === widgets.length - 1} className="border border-stone px-2 py-1 disabled:opacity-40">↓</button>
              <button onClick={() => patch(w.id, { published: !w.published })} className="border border-stone px-3 py-1">
                {w.published ? 'Hide' : 'Show'}
              </button>
              <button onClick={() => remove(w.id)} className="border border-terracotta px-3 py-1 text-terracotta">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the tab in AdminDashboard**

In `components/AdminDashboard.tsx`:
- Add the import near the other admin imports:
```tsx
import AdminWidgets from '@/components/AdminWidgets';
```
- Add to the `TABS` array (after `{ id: 'media', label: 'Media' }`):
```tsx
  { id: 'homepage', label: 'Homepage' },
```
- In the `load` callback's early-return guard, add `'homepage'` to the self-loading tabs list:
```tsx
    if (currentTab === 'ai' || currentTab === 'lessons' || currentTab === 'reporting' || currentTab === 'media' || currentTab === 'homepage') {
```
- In the render, add a branch alongside the other tab branches (before the default table). Insert after the `tab === 'media' ? (<AdminMedia />)` branch:
```tsx
      ) : tab === 'homepage' ? (
        <AdminWidgets />
```

- [ ] **Step 3: Verify build + full test suite**

Run: `npm run build`
Expected: compiles.
Run: `npm test`
Expected: all green (no unit tests for this UI; the routes it calls are already covered).

- [ ] **Step 4: Commit**

```bash
git add components/AdminWidgets.tsx components/AdminDashboard.tsx
git commit -m "feat: admin Homepage tab to manage What's New cards"
```

---

## Task 8: Context-aware header

**Files:**
- Create: `components/SiteHeader.tsx`, `components/LogoutButton.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `getServerSessionPractitioner`, `hasAccess`.

- [ ] **Step 1: Create the LogoutButton (client)**

Create `components/LogoutButton.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/dashboard');
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      className="whitespace-nowrap text-ink2/70 underline transition-colors hover:text-terracotta"
    >
      Log out
    </button>
  );
}
```

- [ ] **Step 2: Create the SiteHeader (server)**

Create `components/SiteHeader.tsx`:
```tsx
import Link from 'next/link';
import { getServerSessionPractitioner } from '@/lib/serverSession';
import { hasAccess, type Audience } from '@/lib/access';
import LogoutButton from '@/components/LogoutButton';

interface NavItem { label: string; href: string; audience?: Audience }

const PRACTITIONER_NAV: NavItem[] = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Learning', href: '/learning' },
  { label: 'Clinical Toolkit', href: '/toolkit' },
  { label: 'Community', href: '/community' },
  { label: 'Events', href: '/events' },
];

export default async function SiteHeader() {
  const practitioner = await getServerSessionPractitioner();
  const signedIn = !!practitioner && practitioner.status === 'approved';
  const navItems = signedIn
    ? PRACTITIONER_NAV.filter((i) =>
        hasAccess({ qualificationStatus: practitioner!.qualificationStatus }, i))
    : [];

  return (
    <header className="border-b border-stone bg-cream">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
        <Link href={signedIn ? '/dashboard' : '/apply'} className="shrink-0 font-heading text-2xl tracking-wide text-ink">
          Wild Nutrition<sup className="align-super text-xs">®</sup>
        </Link>
        {signedIn ? (
          <nav className="flex items-center gap-5 overflow-x-auto text-xs uppercase tracking-[0.2em]">
            {navItems.map((i) => (
              <Link key={i.href} href={i.href} className="whitespace-nowrap text-ink2 transition-colors hover:text-terracotta">
                {i.label}
              </Link>
            ))}
            <LogoutButton />
          </nav>
        ) : (
          <nav className="flex items-center gap-6 text-xs uppercase tracking-[0.2em]">
            <Link href="/apply" className="text-ink2 transition-colors hover:text-terracotta">Apply</Link>
            <Link href="/dashboard" className="text-ink2 transition-colors hover:text-terracotta">Sign in</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Wire it into the layout**

In `app/layout.tsx`:
- Add import at the top: `import SiteHeader from '@/components/SiteHeader';`
- Replace the entire inline `<header className="border-b border-stone bg-cream"> … </header>` block with:
```tsx
        <SiteHeader />
```
Leave `<main>` and `<footer>` unchanged.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add components/SiteHeader.tsx components/LogoutButton.tsx app/layout.tsx
git commit -m "feat: context-aware header with practitioner nav"
```

---

## Task 9: ComingSoon component + stub routes

**Files:**
- Create: `components/ComingSoon.tsx`
- Create: `app/learning/page.tsx`, `app/toolkit/page.tsx`, `app/community/page.tsx`, `app/events/page.tsx`, `app/coming-soon/page.tsx`

- [ ] **Step 1: Create the ComingSoon component**

Create `components/ComingSoon.tsx`:
```tsx
export default function ComingSoon({ title, blurb }: { title: string; blurb?: string }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24 text-center">
      <p className="text-xs uppercase tracking-[0.25em] text-terracotta">Coming soon</p>
      <h1 className="mt-3 font-heading text-4xl text-ink">{title}</h1>
      <p className="mt-4 text-ink2/80">
        {blurb ?? 'This part of the Practitioner Hub is on its way. Check back soon.'}
      </p>
      <a href="/dashboard" className="mt-8 inline-block bg-ink px-6 py-3 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta">
        Back to Home
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Create the four named stub routes**

Create `app/learning/page.tsx`:
```tsx
import ComingSoon from '@/components/ComingSoon';
export const metadata = { title: 'Learning | Wild Nutrition Practitioner Community' };
export default function Page() {
  return <ComingSoon title="Learning Pathways" blurb="Structured, multi-module pathways with CPD certificates arrive in the next release." />;
}
```
Create `app/toolkit/page.tsx`:
```tsx
import ComingSoon from '@/components/ComingSoon';
export const metadata = { title: 'Clinical Toolkit | Wild Nutrition Practitioner Community' };
export default function Page() {
  return <ComingSoon title="Clinical Toolkit" blurb="Patient handouts, protocols, decision trees and more are coming soon." />;
}
```
Create `app/community/page.tsx`:
```tsx
import ComingSoon from '@/components/ComingSoon';
export const metadata = { title: 'Community | Wild Nutrition Practitioner Community' };
export default function Page() {
  return <ComingSoon title="Community" blurb="The practitioner community board and Facebook group link are on their way." />;
}
```
Create `app/events/page.tsx`:
```tsx
import ComingSoon from '@/components/ComingSoon';
export const metadata = { title: 'Events | Wild Nutrition Practitioner Community' };
export default function Page() {
  return <ComingSoon title="Events Hub" blurb="Live webinars, on-demand recordings and event registration are coming soon." />;
}
```
Create `app/coming-soon/page.tsx` (generic fallback for My Downloads / My CPD / Book Consultation):
```tsx
import ComingSoon from '@/components/ComingSoon';
export const metadata = { title: 'Coming soon | Wild Nutrition Practitioner Community' };
export default function Page() {
  return <ComingSoon title="Coming soon" />;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: compiles; routes `/learning`, `/toolkit`, `/community`, `/events`, `/coming-soon` listed.

- [ ] **Step 4: Commit**

```bash
git add components/ComingSoon.tsx app/learning app/toolkit app/community app/events app/coming-soon
git commit -m "feat: ComingSoon placeholder + stub routes for Parts 3-5"
```

---

## Task 10: Cinematic Welcome experience + first-login gate

**Files:**
- Create: `app/onboarding/welcome/fonts.ts`, `app/onboarding/welcome/page.tsx`, `components/WelcomeExperience.tsx`
- Modify: `app/dashboard/page.tsx` (server redirect gate)

**Interfaces:**
- Consumes: `getServerSessionPractitioner`; `POST /api/me/seen-welcome`.

- [ ] **Step 1: Create the scoped fonts module**

Create `app/onboarding/welcome/fonts.ts`:
```ts
import { Fraunces, Inter } from 'next/font/google';

export const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
});

export const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
});
```

- [ ] **Step 2: Create the WelcomeExperience client component**

Create `components/WelcomeExperience.tsx`:
```tsx
'use client';

import { useRef, useState } from 'react';
import { motion, useInView, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

const NAVY = '#16233F';
const NAVY_DARK = '#101a30';
const TERRACOTTA = '#C1573D';
const CREAM = '#F3EEE1';
const CARD = '#1E2C4C';

function Grain() {
  return (
    <svg aria-hidden className="pointer-events-none fixed inset-0 h-full w-full"
      style={{ mixBlendMode: 'overlay', opacity: 0.12 }}>
      <filter id="wn-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={3} stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#wn-grain)" />
    </svg>
  );
}

function WordPullUp({ text, className, style, delay = 0 }:
  { text: string; className?: string; style?: React.CSSProperties; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10%' });
  const words = text.split(' ');
  return (
    <span ref={ref} className={className} style={style}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden align-baseline">
          <motion.span className="inline-block"
            initial={{ y: 20, opacity: 0 }}
            animate={inView ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
            transition={{ duration: 0.5, delay: delay + i * 0.08, ease: [0.22, 1, 0.36, 1] }}>
            {w}{i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

function Char({ char, progress, range }:
  { char: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.2, 1]);
  return <motion.span style={{ opacity }}>{char === ' ' ? ' ' : char}</motion.span>;
}

function ScrollReveal({ text, className, style }:
  { text: string; className?: string; style?: React.CSSProperties }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.8', 'end 0.2'] });
  const chars = text.split('');
  return (
    <p ref={ref} className={className} style={style}>
      {chars.map((c, i) => (
        <Char key={i} char={c} progress={scrollYProgress}
          range={[i / chars.length, (i + 1) / chars.length]} />
      ))}
    </p>
  );
}

function StartButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    await fetch('/api/me/seen-welcome', { method: 'POST' });
    router.push('/dashboard');
    router.refresh();
  }
  return (
    <button onClick={start} disabled={busy}
      className="group mt-10 inline-flex items-center gap-3 rounded-full px-7 py-3 text-sm font-medium transition-all hover:gap-4 disabled:opacity-60"
      style={{ backgroundColor: TERRACOTTA, color: NAVY, fontFamily: 'var(--font-inter)' }}>
      Start Exploring
      <span className="flex h-7 w-7 items-center justify-center rounded-full transition-transform group-hover:scale-110"
        style={{ backgroundColor: NAVY, color: CREAM }}>
        <ArrowRight size={16} />
      </span>
    </button>
  );
}

export default function WelcomeExperience({ firstName }: { firstName: string | null }) {
  return (
    <div style={{ backgroundColor: NAVY, color: CREAM, fontFamily: 'var(--font-inter)' }}>
      <Grain />
      {/* Scene 1 — Hero */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center"
        style={{ background: `radial-gradient(circle at 70% 20%, rgba(193,87,61,0.16), ${NAVY} 45%, ${NAVY_DARK})` }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
          className="mb-10 text-sm tracking-[0.35em]"
          style={{ fontFamily: 'var(--font-fraunces)', color: CREAM }}>
          WILD NUTRITION
        </motion.div>
        <WordPullUp text={firstName ? `Welcome, ${firstName}.` : 'Welcome.'}
          className="block max-w-5xl text-[10vw] font-light leading-[0.9] md:text-[7vw]"
          style={{ fontFamily: 'var(--font-fraunces)', color: CREAM }} />
        <motion.p initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-8 max-w-lg text-base leading-relaxed"
          style={{ color: 'rgba(243,238,225,0.7)' }}>
          Lorna and the team built this platform because practitioners told us they wanted
          practical support that saves time in clinic and helps them deliver the best outcomes.
        </motion.p>
        <motion.div animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-10 text-xs uppercase tracking-[0.25em]"
          style={{ color: 'rgba(243,238,225,0.6)' }}>
          Scroll to continue
        </motion.div>
      </section>

      {/* Scene 2 — Mission */}
      <section className="relative flex min-h-screen items-center justify-center px-6 py-24">
        <div className="mx-auto w-full max-w-3xl rounded-2xl px-6 py-14 sm:px-12 sm:py-16"
          style={{ backgroundColor: CARD }}>
          <p className="text-xs font-medium uppercase tracking-[0.28em]" style={{ color: TERRACOTTA }}>
            Practitioner Education
          </p>
          <h2 className="mt-6 text-3xl leading-snug sm:text-4xl md:text-5xl md:leading-tight">
            <WordPullUp text="This platform was shaped by"
              style={{ fontFamily: 'var(--font-inter)', fontWeight: 400 }} />{' '}
            <WordPullUp text="Lorna Driver-Davies,"
              style={{ fontFamily: 'var(--font-fraunces)', fontStyle: 'italic', color: TERRACOTTA }} />{' '}
            <WordPullUp text="Head of Practitioner Education at Wild Nutrition."
              style={{ fontFamily: 'var(--font-inter)', fontWeight: 400 }} />
          </h2>
          <ScrollReveal text="Our mission is to support practitioners beyond the consultation room."
            className="mt-8 text-lg leading-relaxed" style={{ color: CREAM }} />
          <StartButton />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Create the Welcome page (server gate)**

Create `app/onboarding/welcome/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { getServerSessionPractitioner } from '@/lib/serverSession';
import WelcomeExperience from '@/components/WelcomeExperience';
import { fraunces, inter } from './fonts';

export const metadata = { title: 'Welcome | Wild Nutrition Practitioner Community' };

export default async function WelcomePage() {
  const p = await getServerSessionPractitioner();
  if (!p || p.status !== 'approved') redirect('/dashboard');
  if (p.hasSeenWelcome) redirect('/dashboard');
  return (
    <div className={`${fraunces.variable} ${inter.variable}`}>
      <WelcomeExperience firstName={p.name.split(' ')[0] || null} />
    </div>
  );
}
```

- [ ] **Step 4: Add the first-login gate to the dashboard page**

Replace the entire contents of `app/dashboard/page.tsx` with:
```tsx
import { redirect } from 'next/navigation';
import { getServerSessionPractitioner } from '@/lib/serverSession';
import DashboardApp from '@/components/DashboardApp';

export const metadata = { title: 'My Dashboard | Wild Nutrition Practitioner Community' };

export default async function DashboardPage() {
  const p = await getServerSessionPractitioner();
  if (p && p.status === 'approved' && !p.hasSeenWelcome) {
    redirect('/onboarding/welcome');
  }
  return <DashboardApp />;
}
```

- [ ] **Step 5: Verify build + full test suite**

Run: `npm run build`
Expected: compiles; `/onboarding/welcome` route present.
Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/onboarding components/WelcomeExperience.tsx app/dashboard/page.tsx
git commit -m "feat: cinematic Welcome experience + first-login gate"
```

---

## Task 11: Homepage redesign (DashboardApp)

**Files:**
- Modify: `components/DashboardApp.tsx`

**Interfaces:**
- Consumes: `/api/me`, `/api/me/stats`, `/api/me/widgets`.

- [ ] **Step 1: Rework the logged-in body**

In `components/DashboardApp.tsx`, keep the login screen (`authed === false`) and loading shell unchanged. Make these changes:

(a) Add a `Widget` interface near the other interfaces at the top:
```tsx
interface Widget {
  id: number; title: string; body: string | null;
  linkUrl: string | null; imageUrl: string | null;
}
```
(b) Add greeting + quick-links config above the component:
```tsx
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_LINKS: { label: string; href: string; ready: boolean }[] = [
  { label: 'Ask Lorna', href: '/assistant', ready: true },
  { label: 'Book Technical Consultation', href: '/coming-soon', ready: false },
  { label: 'Clinical Toolkit', href: '/toolkit', ready: false },
  { label: 'Community', href: '/community', ready: false },
  { label: 'Events', href: '/events', ready: false },
  { label: 'My Downloads', href: '/coming-soon', ready: false },
  { label: 'My CPD', href: '/coming-soon', ready: false },
];
```
(c) Add widgets state + fetch. After the existing `const [stats, setStats] = useState<Stats | null>(null);` line add:
```tsx
  const [widgets, setWidgets] = useState<Widget[]>([]);
```
In the mount effect, after `loadStats();` add a widgets fetch:
```tsx
      fetch('/api/me/widgets').then(async (r) => { if (r.ok) setWidgets((await r.json()).widgets); });
```
(d) Remove the top-of-dashboard header row that contained the `Protocol Assistant` link and the `Log out` button (the global `SiteHeader` now owns Log out; Ask Lorna is a Quick Link). Replace the whole logged-in `return (...)` block (the final one, starting `// ---- Dashboard ----`) with:
```tsx
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {/* Greeting */}
      <p className={label}>Practitioner Hub</p>
      <h1 className="mt-1 font-heading text-3xl text-ink md:text-4xl">
        {greeting()}, {p.name.split(' ')[0]}
      </h1>

      {/* Continue Learning */}
      <div className={`${card} mt-8 flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <p className={label}>Continue learning</p>
          <p className="mt-2 font-heading text-3xl text-ink">
            {stats ? stats.lessonsCompleted : '—'} <span className="text-base text-ink2/60">lessons completed</span>
          </p>
          <p className="mt-1 text-xs text-ink2/60">Pathway progress arrives with Learning Pathways.</p>
        </div>
        <a href="/library" className="bg-forest px-6 py-3 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta">
          Open the learning library
        </a>
      </div>

      {/* What's New */}
      {widgets.length > 0 && (
        <section className="mt-8">
          <p className={label}>What&apos;s new</p>
          <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
            {widgets.map((w) => {
              const inner = (
                <>
                  {w.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.imageUrl} alt="" className="mb-3 h-32 w-full rounded-sm object-cover" />
                  )}
                  <p className="font-heading text-lg text-ink">{w.title}</p>
                  {w.body && <p className="mt-1 text-sm text-ink2/70">{w.body}</p>}
                </>
              );
              return w.linkUrl ? (
                <a key={w.id} href={w.linkUrl} className={`${card} block w-64 shrink-0 transition-colors hover:border-terracotta`}>{inner}</a>
              ) : (
                <div key={w.id} className={`${card} w-64 shrink-0`}>{inner}</div>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick Links */}
      <section className="mt-8">
        <p className={label}>Quick links</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((q) => (
            <a key={q.label} href={q.href}
              className={`${card} flex items-center justify-between transition-colors hover:border-terracotta`}>
              <span className="font-heading text-lg text-ink">{q.label}</span>
              {!q.ready && <span className="text-[10px] uppercase tracking-[0.15em] text-ink2/50">Coming soon</span>}
            </a>
          ))}
        </div>
      </section>

      {/* Your referrals (compact) */}
      <section className="mt-8">
        <p className={label}>Your referrals</p>
        <div className={`${card} mt-3`}>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className={label}>Referral code</p>
              <p className="mt-2 font-heading text-3xl text-terracotta">{me.code}</p>
              <div className="mt-3"><CopyButton value={me.code ?? ''}>Copy code</CopyButton></div>
            </div>
            <div>
              <p className={label}>Referral link</p>
              <p className="mt-2 break-all text-sm text-ink2/90">{me.link}</p>
              <div className="mt-3"><CopyButton value={me.link ?? ''}>Copy link</CopyButton></div>
            </div>
          </div>
          {stats?.stale && (
            <p className="mt-4 border-l-2 border-terracotta bg-cream px-4 py-2 text-xs text-ink2/80">
              Live stats are temporarily unavailable — showing the most recent figures.
            </p>
          )}
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {stats ? (
              <>
                <StatCard title="Clicks this month" month={String(stats.clicksThisMonth)} allTime={`${stats.clicksAllTime}`} />
                <StatCard title="Orders this month" month={String(stats.ordersThisMonth)} allTime={`${stats.ordersAllTime}`} />
                <StatCard title="Conversion rate" month={`${stats.conversionRate}%`} allTime={null} />
                <StatCard title="Commission this month" month={gbp(stats.commissionThisMonth)} allTime={gbp(stats.commissionAllTime)} />
              </>
            ) : (
              [0, 1, 2, 3].map((i) => <div key={i} className={card}><Skeleton /></div>)
            )}
          </div>
        </div>
      </section>

      {/* Tier (slim) */}
      <div className={`${card} mt-8 flex items-center justify-between`}>
        <div>
          <p className={label}>Your tier</p>
          <p className="mt-1 font-heading text-2xl capitalize text-forest">{p.tier}</p>
        </div>
        <p className="max-w-xs text-right text-xs text-ink2/60">Tiering automation arrives in a later release.</p>
      </div>
    </div>
  );
```

- [ ] **Step 2: Verify build + full test suite**

Run: `npm run build`
Expected: compiles.
Run: `npm test`
Expected: all green. If `tests/api-dashboard.test.ts` or any component test asserted on removed dashboard text (e.g. "Welcome back"), update the assertion to the new greeting copy.

- [ ] **Step 3: Commit**

```bash
git add components/DashboardApp.tsx
git commit -m "feat: redesign homepage — greeting, What's New, Quick Links, referrals card"
```

---

## Task 12: Browser verification + wrap-up

**Files:** none (verification only). Requires a local `.env.local` with `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` (or a `DB_PATH` file DB) and `SESSION_SECRET`; magic-link falls back to the on-screen dev link when `GMAIL_*` is unset.

- [ ] **Step 1: Start the dev server via the preview tool**

Use `preview_start` with `{ name: "practitioner-portal" }` (from `.claude/launch.json`, runs `next dev` on 3100). If not defined, add it. Confirm the server is up on `http://localhost:3100`.

- [ ] **Step 2: Verify the public header**

Navigate to `/apply`. Confirm the header shows **Apply / Sign in** (logged-out state), no practitioner nav. Screenshot.

- [ ] **Step 3: Log in as an approved practitioner + verify the Welcome gate**

Request a magic link at `/dashboard` for an approved test email, follow the on-screen dev link. Because existing rows were backfilled to `has_seen_welcome=1`, they will NOT see the Welcome. To exercise the Welcome: in the DB set one test practitioner's `has_seen_welcome=0` (`UPDATE practitioners SET has_seen_welcome=0 WHERE id=<id>`), reload `/dashboard`, and confirm it redirects to `/onboarding/welcome`.

- [ ] **Step 4: Verify the Welcome experience**

On `/onboarding/welcome`: confirm Scene 1 headline "Welcome, {First}." animates word-by-word, no image/video assets load (check network tab — only font + JS), scroll to Scene 2, confirm the mission line reveals character-by-character, click **Start Exploring**, confirm it lands on `/dashboard` and does NOT show Welcome again on reload. Screenshot both scenes. Resize to 375px and confirm both scenes are readable and the headline scales down.

- [ ] **Step 5: Verify the new homepage + nav**

On `/dashboard`: confirm greeting, Continue Learning, Quick Links grid (Ask Lorna clickable → `/assistant`; others show "Coming soon" and land on placeholders), and the compact referrals card with stats. Confirm the header now shows the practitioner nav (Home/Learning/Clinical Toolkit/Community/Events + Log out) and each nav link resolves (coming-soon pages render, not 404). Check the console for errors. Screenshot desktop + 375px mobile.

- [ ] **Step 6: Verify admin What's New management**

Log into `/admin`, open the **Homepage** tab, add a What's New card (title + body + audience=Everyone), reload `/dashboard`, confirm the card appears in the What's New feed. Set it to a different audience than your test practitioner and confirm it disappears from their feed. Hide it and confirm it disappears; delete it.

- [ ] **Step 7: Final gate — full suite + build**

Run: `npm test`
Expected: all green.
Run: `npm run build`
Expected: clean.

- [ ] **Step 8: Update handoff docs**

Append a Part 2 section to `PRACTSESSION_HANDOFF.md` and update `CLAUDE.md` (new routes `/onboarding/welcome`, `/learning|/toolkit|/community|/events|/coming-soon`; new APIs `/api/admin/widgets*`, `/api/me/widgets`, `/api/me/seen-welcome`; `has_seen_welcome` column; `framer-motion`/`lucide-react` deps; context-aware `SiteHeader`). Commit:
```bash
git add PRACTSESSION_HANDOFF.md CLAUDE.md
git commit -m "docs: Part 2 homepage/onboarding handoff + agent guide update"
```

- [ ] **Step 9: Merge decision**

Do NOT auto-merge. Report the acceptance checklist status and let the user click through it before merging `part-2-homepage` to `main` (per the plan's branching rule — migrations land in order).

---

## Acceptance checklist (verify in Task 12)

- [ ] First login shows the 2-scene Welcome once, never again.
- [ ] No image/video asset required for the Welcome page.
- [ ] Scene 2 mission quote reveals character-by-character.
- [ ] CTA sets `has_seen_welcome` and routes into the homepage.
- [ ] Welcome + homepage responsive to 375px.
- [ ] Quick Links present; unbuilt targets clearly "coming soon", not broken.
- [ ] Admin can add/remove/reorder/hide What's New cards without a deploy.
- [ ] Header shows practitioner nav when signed in, Apply/Sign in when not.
- [ ] `npm test` green; `npm run build` clean.
