# Presence — "Live Now" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin a Messenger-style "Live Now" view — a green dot next to online practitioners and an "Online now" list in the Live Chat tab, with one click to start a chat.

**Architecture:** Signed-in practitioner browsers send a lightweight heartbeat (`POST /api/me/presence`) every 30s while their tab is focused, updating `practitioners.last_seen_at`. The admin Live Chat tab polls `/api/admin/presence` (and the existing conversation list, now carrying an `online` flag) and renders green dots + an "Online now" strip. Online = seen within 90 seconds.

**Tech Stack:** Next.js 14 App Router, Turso/libSQL (raw async SQL, no ORM), React client components, Vitest. No new dependencies.

## Global Constraints

- **DB layer is raw parameterised SQL, all `async`** (`lib/db.ts`). No ORM. Use the existing private `run`/`one`/`all` helpers inside `lib/db.ts`; they are NOT exported.
- **Migrations are append-only** in `lib/migrations.ts`; each entry is `{ id: 'NNN_name', sql }`, applied once via `executeMultiple`. Never edit an existing migration.
- **Time comparisons use SQLite `datetime('now')`** on both read and write (UTC text) — never JS `Date` for the window, to avoid timezone skew.
- **Online window = 90 seconds; heartbeat = 30 seconds.** Single source of truth: `PRESENCE_WINDOW_SECONDS = 90` exported from `lib/db.ts`.
- **Route handlers** set `export const dynamic = 'force-dynamic'` (matches existing chat/me routes).
- **Auth:** practitioner routes use `getSessionPractitioner(req)` and require `status === 'approved'`; admin routes use `isAuthed(req)` from `lib/adminAuth`.
- **Keep all 282 existing tests green.** New tests follow the file DB pattern in `tests/chat-db.test.ts` / `tests/api-chat.test.ts` (`process.env.DB_PATH` in a tmp dir, `resetDbForTests()` in `afterEach`).
- **Commit after every task** with the message shown.
- Deploy (only when asked) via `npx vercel --prod --yes`. Migration 015 runs automatically on first client connection.

---

### Task 1: Presence store — migration 015, type field, `touchPresence`

**Files:**
- Modify: `lib/migrations.ts` (append migration `015_presence`)
- Modify: `lib/db.ts` (`Practitioner` interface ~line 18-35, `rowToPractitioner` ~line 282-303, add `PRESENCE_WINDOW_SECONDS` + `touchPresence`)
- Test: `tests/presence-db.test.ts` (new)

**Interfaces:**
- Produces:
  - `PRESENCE_WINDOW_SECONDS: number` (= 90), exported from `lib/db.ts`.
  - `touchPresence(practitionerId: number): Promise<void>` — sets `last_seen_at = datetime('now')`.
  - `Practitioner.lastSeenAt: string | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/presence-db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-presence-db-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved(email = 'p1@example.com', name = 'Pat One') {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name, email, registerBody: 'BANT', registerNumber: '12345', qualificationStatus: 'qualified',
  });
  const code = `WN-${p.id}-AB2C`;
  await markApproved(p.id, {
    affiliateCode: code, affiliateLink: `http://x/r/${code}`, pendingSync: false, decidedBy: 'system',
  });
  return p;
}

describe('presence store', () => {
  it('touchPresence sets last_seen_at on the practitioner', async () => {
    const p = await seedApproved();
    const db = await import('@/lib/db');
    expect((await db.getPractitioner(p.id))!.lastSeenAt).toBeNull();
    await db.touchPresence(p.id);
    const after = await db.getPractitioner(p.id);
    expect(after!.lastSeenAt).not.toBeNull();
  });

  it('exports PRESENCE_WINDOW_SECONDS = 90', async () => {
    const db = await import('@/lib/db');
    expect(db.PRESENCE_WINDOW_SECONDS).toBe(90);
  });
});
```

(Verified: the by-id getter is `getPractitioner(id)` in `lib/db.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/presence-db.test.ts`
Expected: FAIL — `touchPresence` / `PRESENCE_WINDOW_SECONDS` not exported, and `lastSeenAt` undefined.

- [ ] **Step 3: Add migration 015**

In `lib/migrations.ts`, append a new object to the end of the `MIGRATIONS` array (after `014_certifications`):

```typescript
  {
    id: '015_presence',
    sql: `
ALTER TABLE practitioners ADD COLUMN last_seen_at TEXT;
`,
  },
```

- [ ] **Step 4: Add the type field, constant, and helper in `lib/db.ts`**

In the `Practitioner` interface, add after `hasSeenWelcome: boolean;`:

```typescript
  lastSeenAt: string | null;
```

In `rowToPractitioner`, add after the `hasSeenWelcome` line:

```typescript
    lastSeenAt: (row.last_seen_at as string | null) ?? null,
```

Add the constant near the top of `lib/db.ts` (after imports/other consts):

```typescript
/** A practitioner is "online" if seen within this many seconds. */
export const PRESENCE_WINDOW_SECONDS = 90;
```

Add the helper (near the other practitioner helpers, e.g. beside `markSeenWelcome`):

```typescript
/** Record that this practitioner's browser is currently active (presence heartbeat). */
export async function touchPresence(practitionerId: number): Promise<void> {
  await run(`UPDATE practitioners SET last_seen_at = datetime('now') WHERE id = ?`, [practitionerId]);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/presence-db.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add lib/migrations.ts lib/db.ts tests/presence-db.test.ts
git commit -m "feat: presence store (migration 015 last_seen_at + touchPresence)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Read helpers — `listOnlinePractitioners` + `online` on the admin conversation list

**Files:**
- Modify: `lib/db.ts` (add `OnlinePractitioner` type + `listOnlinePractitioners`; add `online` to `listConversationsForAdmin` ~line 1736 and its summary type)
- Test: `tests/presence-db.test.ts` (extend)

**Interfaces:**
- Consumes: `PRESENCE_WINDOW_SECONDS`, `touchPresence` (Task 1).
- Produces:
  - `interface OnlinePractitioner { id: number; name: string; email: string; lastSeenAt: string; conversationId: number | null }`
  - `listOnlinePractitioners(windowSeconds?: number): Promise<OnlinePractitioner[]>` — approved practitioners seen within the window, newest-seen first; `conversationId` = their open conversation id or `null`.
  - `ChatConversationSummary` gains `online: boolean`.

- [ ] **Step 1: Write the failing test**

Append to `tests/presence-db.test.ts` inside the `describe`:

```typescript
  it('listOnlinePractitioners includes touched approved practitioners, excludes never-seen', async () => {
    const online = await seedApproved('on@example.com', 'On Line');
    const offline = await seedApproved('off@example.com', 'Off Line');
    const db = await import('@/lib/db');
    await db.touchPresence(online.id);
    const list = await db.listOnlinePractitioners();
    const ids = list.map((r) => r.id);
    expect(ids).toContain(online.id);
    expect(ids).not.toContain(offline.id);
  });

  it('listOnlinePractitioners surfaces the open conversation id when one exists', async () => {
    const p = await seedApproved('c@example.com', 'Convo Haver');
    const db = await import('@/lib/db');
    await db.touchPresence(p.id);
    let row = (await db.listOnlinePractitioners()).find((r) => r.id === p.id)!;
    expect(row.conversationId).toBeNull();
    const convo = await db.getOrCreateOpenConversation(p.id, 'hi');
    row = (await db.listOnlinePractitioners()).find((r) => r.id === p.id)!;
    expect(row.conversationId).toBe(convo.id);
  });

  it('excludes non-approved practitioners even if touched', async () => {
    const { insertApplication } = await import('@/lib/db');
    const pending = await insertApplication({
      name: 'Pending Person', email: 'pend@example.com', registerBody: 'BANT',
      registerNumber: '999', qualificationStatus: 'qualified',
    });
    const db = await import('@/lib/db');
    await db.touchPresence(pending.id);
    const ids = (await db.listOnlinePractitioners()).map((r) => r.id);
    expect(ids).not.toContain(pending.id);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/presence-db.test.ts`
Expected: FAIL — `listOnlinePractitioners` not exported.

- [ ] **Step 3: Add `OnlinePractitioner` + `listOnlinePractitioners`**

In `lib/db.ts`, add the type near the other chat/practitioner types:

```typescript
export interface OnlinePractitioner {
  id: number;
  name: string;
  email: string;
  lastSeenAt: string;
  conversationId: number | null;
}
```

Add the helper (near `listConversationsForAdmin`):

```typescript
/** Approved practitioners whose last heartbeat is within `windowSeconds`, newest first. */
export async function listOnlinePractitioners(
  windowSeconds: number = PRESENCE_WINDOW_SECONDS
): Promise<OnlinePractitioner[]> {
  const rows = await all(
    `SELECT p.id, p.name, p.email, p.last_seen_at,
       (SELECT c.id FROM chat_conversations c
         WHERE c.practitioner_id = p.id AND c.status = 'open'
         ORDER BY c.id DESC LIMIT 1) AS convo_id
     FROM practitioners p
     WHERE p.status = 'approved'
       AND p.last_seen_at IS NOT NULL
       AND p.last_seen_at >= datetime('now', ?)
     ORDER BY p.last_seen_at DESC`,
    [`-${windowSeconds} seconds`]
  );
  return rows.map((r) => ({
    id: num(r.id),
    name: r.name as string,
    email: r.email as string,
    lastSeenAt: r.last_seen_at as string,
    conversationId: r.convo_id != null ? num(r.convo_id) : null,
  }));
}
```

- [ ] **Step 4: Add `online` to the admin conversation list**

Find the `ChatConversationSummary` interface (grep `ChatConversationSummary` in `lib/db.ts`) and add:

```typescript
  online: boolean;
```

In `listConversationsForAdmin`, change the SELECT to also compute online from the joined practitioner. Replace the `p.email AS p_email,` line's context so the joined columns include:

```sql
       p.name AS p_name, p.email AS p_email,
       (CASE WHEN p.last_seen_at IS NOT NULL
             AND p.last_seen_at >= datetime('now', '-90 seconds')
            THEN 1 ELSE 0 END) AS p_online,
```

(The `JOIN practitioners p` is already present.) Then in the `.map`, add:

```typescript
    online: num(r.p_online) === 1,
```

Note: the `-90 seconds` literal here mirrors `PRESENCE_WINDOW_SECONDS`; keep them equal.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/presence-db.test.ts`
Expected: PASS (all five tests). Also run `npx vitest run tests/chat-db.test.ts` to confirm the `listConversationsForAdmin` change didn't break existing chat tests.

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts tests/presence-db.test.ts
git commit -m "feat: listOnlinePractitioners + online flag on admin conversation list

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Presence APIs — `POST /api/me/presence` and `GET /api/admin/presence`

**Files:**
- Create: `app/api/me/presence/route.ts`
- Create: `app/api/admin/presence/route.ts`
- Test: `tests/api-presence.test.ts` (new)

**Interfaces:**
- Consumes: `touchPresence`, `listOnlinePractitioners` (Tasks 1-2), `getSessionPractitioner`, `isAuthed`.
- Produces:
  - `POST /api/me/presence` → `204` on success, `401` if not an approved practitioner. Body ignored.
  - `GET /api/admin/presence` → `{ online: OnlinePractitioner[], count: number }`, `401` without admin auth.

- [ ] **Step 1: Write the failing test**

Create `tests/api-presence.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-presence-api-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'test-admin-pw';
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved(email = 'p@example.com', name = 'Pat One') {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name, email, registerBody: 'BANT', registerNumber: '12345', qualificationStatus: 'qualified',
  });
  const code = `WN-${p.id}-AB2C`;
  await markApproved(p.id, {
    affiliateCode: code, affiliateLink: `http://x/r/${code}`, pendingSync: false, decidedBy: 'system',
  });
  return p;
}
async function pHeaders(id: number) {
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return { cookie: sessionCookieHeader(id).split(';')[0], 'Content-Type': 'application/json' };
}
async function adminHeaders() {
  const { adminToken } = await import('@/lib/adminAuth');
  return { cookie: `wn_admin=${adminToken()}`, 'Content-Type': 'application/json' };
}

describe('presence API', () => {
  it('POST /api/me/presence 401 without a session', async () => {
    const { POST } = await import('@/app/api/me/presence/route');
    const res = await POST(new Request('http://x/api/me/presence', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('POST /api/me/presence touches the row and admin sees them online', async () => {
    const p = await seedApproved();
    const { POST } = await import('@/app/api/me/presence/route');
    const beat = await POST(new Request('http://x/api/me/presence', { method: 'POST', headers: await pHeaders(p.id) }));
    expect(beat.status).toBe(204);

    const { GET } = await import('@/app/api/admin/presence/route');
    const res = await GET(new Request('http://x/api/admin/presence', { headers: await adminHeaders() }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(1);
    expect(data.online.map((o: { id: number }) => o.id)).toContain(p.id);
  });

  it('GET /api/admin/presence 401 without admin auth', async () => {
    const { GET } = await import('@/app/api/admin/presence/route');
    const res = await GET(new Request('http://x/api/admin/presence'));
    expect(res.status).toBe(401);
  });
});
```

Note: confirm `adminToken` is the export used to mint the admin cookie (it is, per `tests/api-chat.test.ts`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api-presence.test.ts`
Expected: FAIL — route modules do not exist.

- [ ] **Step 3: Create `app/api/me/presence/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { touchPresence } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Presence heartbeat. The practitioner's browser POSTs this every ~30s while focused. */
export async function POST(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  await touchPresence(p.id);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Create `app/api/admin/presence/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { listOnlinePractitioners } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Currently-online practitioners for the admin "Live Now" view. */
export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const online = await listOnlinePractitioners();
  return NextResponse.json({ online, count: online.length });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/api-presence.test.ts`
Expected: PASS (all three tests).

- [ ] **Step 6: Commit**

```bash
git add app/api/me/presence/route.ts app/api/admin/presence/route.ts tests/api-presence.test.ts
git commit -m "feat: presence heartbeat + admin presence API

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Heartbeat client — `PresenceBeat` mounted in the layout

**Files:**
- Create: `components/PresenceBeat.tsx`
- Modify: `app/layout.tsx` (mount beside `<ChatGate signedIn={signedIn} />`)

**Interfaces:**
- Consumes: `POST /api/me/presence` (Task 3); `signedIn: boolean` already computed in `app/layout.tsx`.
- Produces: no exports consumed elsewhere. Renders `null`.

This task has no unit test (a client-only timer/`fetch` component). It is verified in the browser at the end of the plan (Task 6 verification). Keep it a single small file.

- [ ] **Step 1: Create `components/PresenceBeat.tsx`**

```typescript
'use client';

import { useEffect } from 'react';

const BEAT_MS = 30_000;

/**
 * Invisible presence heartbeat. Mounted globally for signed-in practitioners
 * (see app/layout.tsx). POSTs /api/me/presence on mount, every 30s while the tab
 * is focused, and immediately when the tab regains focus. Best-effort: errors are
 * ignored. Not coupled to the chat widget — presence must not depend on chat being open.
 */
export default function PresenceBeat({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    if (!signedIn) return;

    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/me/presence', { method: 'POST', cache: 'no-store', keepalive: true }).catch(() => {});
    };

    beat(); // announce immediately on mount
    const timer = setInterval(beat, BEAT_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [signedIn]);

  return null;
}
```

- [ ] **Step 2: Mount it in `app/layout.tsx`**

Add the import near the `ChatGate` import (line ~5):

```typescript
import PresenceBeat from '@/components/PresenceBeat';
```

Add the component right after the existing `<ChatGate signedIn={signedIn} />` line:

```tsx
        <PresenceBeat signedIn={signedIn} />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (Do not run `npm run build` while a dev server is running — it corrupts `.next`, per the handoff.)

- [ ] **Step 4: Commit**

```bash
git add components/PresenceBeat.tsx app/layout.tsx
git commit -m "feat: PresenceBeat heartbeat mounted for signed-in practitioners

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Admin "start conversation" endpoint

**Files:**
- Modify: `app/api/admin/chat/route.ts` (add `POST`)
- Test: `tests/api-chat.test.ts` (extend — add a `POST` start-conversation test)

**Interfaces:**
- Consumes: `getOrCreateOpenConversation(practitionerId, subject?)` (existing — creates an open conversation without inserting a message), `isAuthed`.
- Produces: `POST /api/admin/chat` with JSON `{ practitionerId: number }` → `{ conversationId: number }` (201); `401` without admin auth; `400` on a missing/invalid `practitionerId`.

- [ ] **Step 1: Write the failing test**

Add to `tests/api-chat.test.ts` (reuse its existing `seedApproved` / `adminHeaders` helpers already in that file):

```typescript
  it('POST /api/admin/chat starts (and reuses) an open conversation for a practitioner', async () => {
    const p = await seedApproved('start@example.com', 'Start Target');
    const { POST } = await import('@/app/api/admin/chat/route');
    const mk = () => new Request('http://x/api/admin/chat', {
      method: 'POST', headers: adminHeadersSync(), body: JSON.stringify({ practitionerId: p.id }),
    });
    const first = await POST(mk());
    expect(first.status).toBe(201);
    const a = await first.json();
    expect(a.conversationId).toBeGreaterThan(0);
    const second = await POST(mk());
    const b = await second.json();
    expect(b.conversationId).toBe(a.conversationId); // idempotent get-or-create
  });

  it('POST /api/admin/chat 401 without admin auth', async () => {
    const { POST } = await import('@/app/api/admin/chat/route');
    const res = await POST(new Request('http://x/api/admin/chat', {
      method: 'POST', body: JSON.stringify({ practitionerId: 1 }),
    }));
    expect(res.status).toBe(401);
  });
```

If `adminHeaders` in that file is `async`, call it as `await adminHeaders()` and drop `adminHeadersSync`; match the file's existing style (in the shown head it is `async function adminHeaders()`, so use `const h = await adminHeaders();` and pass `h`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api-chat.test.ts`
Expected: FAIL — `route` has no `POST` export (so `POST` is undefined).

- [ ] **Step 3: Add the `POST` handler to `app/api/admin/chat/route.ts`**

Add these imports/handler to the file (it already imports `isAuthed` and from `@/lib/db`):

```typescript
import { z } from 'zod';
import { getOrCreateOpenConversation } from '@/lib/db';

const startSchema = z.object({ practitionerId: z.number().int().positive() });

/** Admin starts (or reuses) an open conversation with a practitioner — used by the "Online now" list. */
export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = startSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'practitionerId required' }, { status: 400 });
  const convo = await getOrCreateOpenConversation(parsed.data.practitionerId, 'Started by Wild Nutrition');
  return NextResponse.json({ conversationId: convo.id }, { status: 201 });
}
```

If `z` / `NextResponse` are already imported at the top of the file, do not duplicate the import — merge into the existing import lines.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api-chat.test.ts`
Expected: PASS (existing + two new tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/chat/route.ts tests/api-chat.test.ts
git commit -m "feat: admin start-conversation endpoint (POST /api/admin/chat)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Admin UI — "Online now" strip + green dots in the Live Chat tab

**Files:**
- Modify: `components/AdminChat.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/presence` → `{ online: OnlinePractitioner[]; count }`, the `online: boolean` now on each conversation (Task 2), `POST /api/admin/chat` (Task 5), and the component's existing `openConvo(id)` / `loadList()` / `POLL_MS` machinery.
- Produces: UI only.

This task is UI; verify in the browser (steps 4-6) rather than with a unit test.

- [ ] **Step 1: Extend the `Convo` interface and add presence state/types**

At the top of `components/AdminChat.tsx`, add `online` to the `Convo` interface:

```typescript
interface Convo {
  id: number; practitionerName: string; practitionerEmail: string;
  status: 'open' | 'closed'; lastMessage: string | null; lastMessageAt: string | null;
  adminUnread: number; updatedAt: string; online: boolean;
}
```

Add an online-practitioner type and state (inside the component, next to the other `useState` calls):

```typescript
interface OnlineP { id: number; name: string; email: string; lastSeenAt: string; conversationId: number | null }
```

```typescript
  const [online, setOnline] = useState<OnlineP[]>([]);
```

- [ ] **Step 2: Fetch presence in the existing poll loop**

Add a loader alongside `loadList`:

```typescript
  const loadOnline = useCallback(async () => {
    const res = await fetch('/api/admin/presence', { cache: 'no-store' });
    if (res.ok) setOnline((await res.json()).online);
  }, []);
```

Call it initially and in the poll. Update the two existing effects so they also call `loadOnline()`:

```typescript
  useEffect(() => { loadList(); loadOnline(); }, [loadList, loadOnline]);
```

```typescript
  useEffect(() => {
    const t = setInterval(() => {
      loadList();
      loadOnline();
      if (activeRef.current) loadThread(activeRef.current);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [loadList, loadOnline, loadThread]);
```

- [ ] **Step 3: Add the click handler and render the strip + dots**

Add the handler (near `openConvo`):

```typescript
  async function openOrStart(o: OnlineP) {
    if (o.conversationId) { await openConvo(o.conversationId); return; }
    const res = await fetch('/api/admin/chat', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ practitionerId: o.id }),
    });
    if (res.ok) {
      const { conversationId } = await res.json();
      await loadList();
      await openConvo(conversationId);
    }
  }
```

Render an "Online now" strip above the conversation list (place it just inside the conversations view, above the list container). Match the existing Tailwind/brand classes already used in this file (e.g. `text-forest`, `border-stone`, `text-ink`); the markup below is structural — adapt class names to the surrounding list's style:

```tsx
      <div className="mb-3 rounded-lg border border-stone/40 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-forest">
          Online now ({online.length})
        </div>
        {online.length === 0 ? (
          <p className="text-sm text-ink/60">No practitioners online right now.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {online.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => openOrStart(o)}
                  className="flex items-center gap-2 rounded-full border border-stone/50 px-3 py-1 text-sm hover:bg-cream"
                  title={`Message ${o.name}`}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" aria-hidden />
                  <span className="text-ink">{o.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
```

In each conversation list row, add a status dot before the practitioner name. Find where `convo.practitionerName` is rendered and prefix it with:

```tsx
                <span
                  className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${c.online ? 'bg-green-500' : 'bg-stone'}`}
                  title={c.online ? 'Online now' : `Last active ${timeAgo(c.lastMessageAt)}`}
                  aria-hidden
                />
```

(Use whatever the row's conversation variable is named — the existing map likely calls it `c` or `convo`; match it.)

- [ ] **Step 4: Type-check, then start the dev server**

Run: `npx tsc --noEmit` → expect no errors.

Start the preview using the **`portal-dev`** launch config (NOT `portal`) — `portal` runs prod mode and hits prod Turso. Use the browser preview tool with `{ name: "portal-dev" }`. Admin password locally = `preview-admin`.

- [ ] **Step 5: Browser-verify the round trip**

1. In one browser context, sign in as an approved practitioner (or use an existing local test practitioner) and land on the dashboard — this starts the heartbeat.
2. In the admin console (`/admin`, password `preview-admin`), open the **Live Chat** tab.
3. Confirm the practitioner appears under **"Online now (N)"** with a green dot, and (if they have a conversation) a green dot on their conversation row.
4. Click the practitioner in "Online now" → a thread opens (existing convo, or a newly started one). Send an admin reply; confirm it appears.
5. Close the practitioner's tab (or switch its tab to the background) and wait ~90s → the green dot goes grey and they drop out of "Online now" on the next poll.

Use `read_page` / `read_console_messages` to confirm no errors, and a screenshot to capture the green dot + "Online now" strip.

- [ ] **Step 6: Commit**

```bash
git add components/AdminChat.tsx
git commit -m "feat: admin Live Now — online strip + green dots in Live Chat tab

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Full suite + final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Stop any running dev server first (a running dev server + `npm run build` corrupts `.next`; the test run is fine but stop the server to free port 3100 and keep things clean).

Run: `npm test`
Expected: all previous 282 tests PASS plus the new presence tests (`tests/presence-db.test.ts`, `tests/api-presence.test.ts`) and the two added `tests/api-chat.test.ts` cases. Total green.

- [ ] **Step 2: Production type-check / build gate**

Run: `npm run build`
Expected: clean build, no type errors. (Server must be stopped first.)

- [ ] **Step 3: (Optional, only if the user asks to ship) Deploy**

Run: `npx vercel --prod --yes`
Migration 015 applies automatically on the first DB connection in production. Verify presence works on the live URL, then update `PRACTSESSION_HANDOFF.md` to record the new feature.

---

## Self-Review notes (author)

- **Spec coverage:** heartbeat writer (Task 4), presence store/migration (Task 1), read helpers incl. `online` on the conversation list (Task 2), APIs (Task 3), admin-initiated conversation (Task 5, reusing `getOrCreateOpenConversation` rather than a new helper — a deliberate simplification vs the spec's `getOrCreateOpenConversationForAdmin`, same behaviour), admin UI strip + dots (Task 6), tests + green-suite gate (Tasks 1-3, 5, 7). All spec sections map to a task.
- **90s window** is expressed once as `PRESENCE_WINDOW_SECONDS` and mirrored as a literal in the `listConversationsForAdmin` SQL; Task 2 notes to keep them equal.
- **No exact wall-clock boundary unit test** (would be flaky); staleness is covered by NULL-exclusion + inclusion + approved-only tests, and the live 90s expiry is browser-verified in Task 6 Step 5.
- **Type consistency:** `OnlinePractitioner` (db) ↔ `OnlineP` (client, same shape) ↔ `{ online, count }` API; `touchPresence`, `listOnlinePractitioners`, `getOrCreateOpenConversation` names used consistently across tasks.
