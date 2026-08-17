# Cloudflare Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-platform the Practitioner Portal onto Cloudflare (D1 + R2 + Workers) via OpenNext, keeping it fully runnable offline in mock mode until company keys arrive.

**Architecture:** Reuse the app's existing provider seams. Database access already funnels through one `getClient()` in `lib/db.ts`, so D1 is a single libSQL-shaped adapter swap. File storage (`@vercel/blob`, 5 call sites) moves behind a new `lib/storage` abstraction backed by R2. Email already prefers the `fetch`-based Resend provider; we only stop `nodemailer` from being bundled into the Worker. Next.js runs on Workers via `@opennextjs/cloudflare`, which also provides bindings access and a `scheduled()` handler for cron.

**Tech Stack:** Next.js 14 (App Router), `@opennextjs/cloudflare`, Wrangler, Cloudflare D1 (SQLite), Cloudflare R2, Resend (email), Gemini via `fetch`, Vitest.

## Global Constraints

- **Live portfolio untouched:** all work stays on branch `cloudflare-migration`, pushed only to the **work** repo `utkarshrawat123/Practitioner_portal`. Never modify or push `main`.
- **No Cloudflare account needed to build:** everything must build and be testable with Wrangler local emulators (Miniflare local D1 + R2). Real keys are only for the final deploy.
- **Existing suite stays green:** `npm test` (231 Vitest tests) must pass after every task. Tests run against a local `file:` libSQL DB via `process.env.DB_PATH` + `resetDbForTests()`.
- **Mock-until-keyed:** with no bindings/keys, the app runs end-to-end (D1→file, R2→local disk, email→mock). Presence of a binding/key flips that integration live. No code change on go-live.
- **Do not regress `main`'s Vercel/Turso path:** the file/Turso branch of `getClient()` and the current `next dev`/`npm run dev` (port 3100) must keep working.
- **Never reintroduce** a `/tmp` DB fallback or default fetch caching on the libSQL client (see `lib/db.ts` guard).
- **Data:** work copy starts with an **empty D1** (schema only). No data copy.
- **R2 serving:** certificates → gated `/api/files/[...key]` route (auth-checked); media → public bucket URLs.

---

## File Structure

**New files**
- `wrangler.toml` — Cloudflare bindings (D1 `DB`, R2 `BUCKET`), cron triggers, `nodejs_compat`, vars.
- `open-next.config.ts` — OpenNext Cloudflare adapter config.
- `lib/db/d1-adapter.ts` — libSQL-`Client`-shaped adapter over a D1 binding.
- `lib/db/binding.ts` — safe accessor for the Cloudflare request context (returns `null` off-Workers).
- `lib/storage/index.ts` — `put` / `del` / `keyToUrl` storage abstraction (R2 + local disk).
- `app/api/files/[...key]/route.ts` — auth-gated object streaming (certificates).
- `worker.ts` — custom Worker entry: re-exports OpenNext `fetch` handler + adds `scheduled()` for cron.
- `docs/CLOUDFLARE_DEV.md` — local emulator workflow.
- `docs/CLOUDFLARE_GO_LIVE.md` — the copy-paste go-live checklist.
- Test files alongside: `lib/db/d1-adapter.test.ts`, `lib/storage/index.test.ts`, `app/api/files/route.test.ts` (colocated per repo convention — see existing `*.test.ts`).

**Modified files**
- `next.config.mjs` — add `initOpenNextCloudflareForDev()` dev hook.
- `package.json` — dev deps + Cloudflare scripts.
- `lib/db.ts:210-239` — `getClient()`/`rawClient()` select D1 adapter when bound; guard `fs`/`path` to file mode.
- `lib/providers/email.ts` — lazy-load `smtp.ts` so `nodemailer` never bundles on Workers.
- `lib/certificates.ts:2,73` — use `lib/storage` (private).
- `app/api/certification/route.ts:2,62` — use `lib/storage` (private).
- `app/api/admin/media/upload/route.ts` — use `lib/storage` (public).
- `app/api/admin/media/[id]/route.ts:2,26` — use `lib/storage` del.
- `app/api/admin/media/cleanup/route.ts:2,18` — use `lib/storage` del.

---

## Task 1: Cloudflare build scaffolding + local dev loop

**Files:**
- Create: `wrangler.toml`, `open-next.config.ts`, `docs/CLOUDFLARE_DEV.md`
- Modify: `package.json`, `next.config.mjs`

**Interfaces:**
- Consumes: nothing (foundation).
- Produces: `npm run preview:cf` (build + local Worker), `npm run deploy:cf`; binding names `DB` (D1) and `BUCKET` (R2) used by later tasks.

- [ ] **Step 1: Install adapter + CLI**

```bash
npm install --save-dev @opennextjs/cloudflare wrangler
```

- [ ] **Step 2: Create `wrangler.toml`**

```toml
name = "practitioner-portal"
main = ".open-next/worker.js"
compatibility_date = "2024-12-30"
compatibility_flags = ["nodejs_compat"]

# Static assets emitted by the OpenNext build.
assets = { directory = ".open-next/assets", binding = "ASSETS" }

# --- Bindings (placeholder IDs; real values added at go-live) ---
[[d1_databases]]
binding = "DB"
database_name = "practitioner-portal"
database_id = "PLACEHOLDER_D1_ID"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "practitioner-portal-media"

# --- Cron (mirrors today's vercel.json) ---
[triggers]
crons = ["0 6 * * *", "0 7 * * *"]

[vars]
PORTAL_URL = "http://localhost:8787"
COMMISSION_PERCENT = "20"
# Secrets (RESEND_API_KEY, EMAIL_FROM, GEMINI_API_KEY, GEMINI_API_KEY2,
# ANTHROPIC_API_KEY, ADMIN_PASSWORD, SESSION_SECRET, CRON_SECRET, R2_PUBLIC_BASE)
# are set via `wrangler secret put` — never committed.
```

- [ ] **Step 3: Create `open-next.config.ts`**

```typescript
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({});
```

- [ ] **Step 4: Add the dev hook to `next.config.mjs`**

Add at the top of `next.config.mjs`, before the config object, and keep the existing config unchanged:

```javascript
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

// Makes Cloudflare bindings available during `next dev` (no-op when not present).
initOpenNextCloudflareForDev();
```

- [ ] **Step 5: Add scripts to `package.json`**

Add to the `"scripts"` block (leave existing scripts intact):

```json
"preview:cf": "opennextjs-cloudflare build && wrangler dev",
"deploy:cf": "opennextjs-cloudflare build && wrangler deploy",
"cf-typegen": "wrangler types"
```

- [ ] **Step 6: Verify existing tests still pass**

Run: `npm test`
Expected: PASS (231 tests) — scaffolding must not affect the Node/Vercel path.

- [ ] **Step 7: Verify the Worker build succeeds**

Run: `npx opennextjs-cloudflare build`
Expected: completes, emits `.open-next/worker.js`. (Build only — no deploy, no account needed.)

- [ ] **Step 8: Write `docs/CLOUDFLARE_DEV.md`**

Document: `npm run preview:cf` starts a local Worker at `http://localhost:8787` with local D1 + R2 emulation; how to seed local D1 (`wrangler d1 execute practitioner-portal --local --file=...` is optional — the app self-migrates on first request); that no Cloudflare login is required for local runs.

- [ ] **Step 9: Commit**

```bash
git add wrangler.toml open-next.config.ts next.config.mjs package.json package-lock.json docs/CLOUDFLARE_DEV.md
git commit -m "build: add Cloudflare (OpenNext + Wrangler) scaffolding"
```

---

## Task 2: D1 client adapter (libSQL-shaped)

**Files:**
- Create: `lib/db/d1-adapter.ts`, `lib/db/d1-adapter.test.ts`

**Interfaces:**
- Consumes: a `D1Database` binding (from `@cloudflare/workers-types`).
- Produces: `createD1Client(db: D1Database)` returning an object with the subset of the libSQL `Client` interface that `lib/db.ts` + `lib/migrations.ts` use:
  - `execute(stmt: { sql: string; args?: unknown[] } | string): Promise<{ rows: Record<string, unknown>[]; lastInsertRowid?: number; rowsAffected: number }>`
  - `executeMultiple(sql: string): Promise<void>`
  - `batch(stmts: { sql: string; args?: unknown[] }[]): Promise<void>`
  - `close(): void` (no-op)

- [ ] **Step 1: Write the failing test**

```typescript
// lib/db/d1-adapter.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createD1Client } from './d1-adapter';

// Minimal in-memory fake of the D1 binding, backed by better-sqlite3, exposing
// the .prepare().bind().all()/run(), .exec() and .batch() surface the adapter uses.
function fakeD1() {
  const sqlite = new Database(':memory:');
  const makeStmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => makeStmt(sql, a),
    all: async () => {
      const s = sqlite.prepare(sql);
      if (s.reader) return { results: s.all(...(args as [])), meta: { changes: 0, last_row_id: 0 } };
      const info = s.run(...(args as []));
      return { results: [], meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
    },
  });
  return {
    prepare: (sql: string) => makeStmt(sql),
    exec: async (sql: string) => { sqlite.exec(sql); return { count: 0, duration: 0 }; },
    batch: async (stmts: any[]) => Promise.all(stmts.map((s) => s.all())),
  } as any;
}

describe('createD1Client', () => {
  let client: ReturnType<typeof createD1Client>;
  beforeEach(async () => {
    client = createD1Client(fakeD1());
    await client.executeMultiple(
      'CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);'
    );
  });

  it('runs a write and reports lastInsertRowid + rowsAffected', async () => {
    const res = await client.execute({ sql: 'INSERT INTO t (name) VALUES (?)', args: ['alice'] });
    expect(res.rowsAffected).toBe(1);
    expect(res.lastInsertRowid).toBe(1);
  });

  it('reads rows back as column-keyed objects', async () => {
    await client.execute({ sql: 'INSERT INTO t (name) VALUES (?)', args: ['bob'] });
    const res = await client.execute({ sql: 'SELECT id, name FROM t ORDER BY id' });
    expect(res.rows).toEqual([{ id: 1, name: 'bob' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/db/d1-adapter.test.ts`
Expected: FAIL with "Cannot find module './d1-adapter'".

- [ ] **Step 3: Implement the adapter**

```typescript
// lib/db/d1-adapter.ts
import type { D1Database } from '@cloudflare/workers-types';

export interface D1Stmt { sql: string; args?: unknown[] }
export interface D1Result {
  rows: Record<string, unknown>[];
  lastInsertRowid?: number;
  rowsAffected: number;
}

/**
 * Wraps a Cloudflare D1 binding in the subset of the libSQL `Client` interface
 * that `lib/db.ts` and `lib/migrations.ts` call — so all existing query code
 * runs unchanged against D1. Both are SQLite, so SQL is portable.
 */
export function createD1Client(db: D1Database) {
  async function execute(stmt: D1Stmt | string): Promise<D1Result> {
    const { sql, args = [] } = typeof stmt === 'string' ? { sql: stmt, args: [] } : stmt;
    const prepared = db.prepare(sql);
    const bound = args.length ? prepared.bind(...(args as unknown[])) : prepared;
    const out = await bound.all();
    return {
      rows: (out.results ?? []) as Record<string, unknown>[],
      lastInsertRowid: out.meta?.last_row_id ?? 0,
      rowsAffected: out.meta?.changes ?? 0,
    };
  }

  async function executeMultiple(sql: string): Promise<void> {
    await db.exec(sql.replace(/\n\s*\n/g, '\n'));
  }

  async function batch(stmts: D1Stmt[]): Promise<void> {
    const prepared = stmts.map((s) =>
      s.args?.length ? db.prepare(s.sql).bind(...(s.args as unknown[])) : db.prepare(s.sql)
    );
    await db.batch(prepared);
  }

  return { execute, executeMultiple, batch, close() {} };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/db/d1-adapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the workers-types dev dep (if not present)**

```bash
npm install --save-dev @cloudflare/workers-types
```

- [ ] **Step 6: Commit**

```bash
git add lib/db/d1-adapter.ts lib/db/d1-adapter.test.ts package.json package-lock.json
git commit -m "feat: D1 adapter implementing the libSQL client subset"
```

---

## Task 3: Select D1 when a binding is present

**Files:**
- Create: `lib/db/binding.ts`
- Modify: `lib/db.ts:210-239`
- Test: `lib/db/binding.test.ts`

**Interfaces:**
- Consumes: `createD1Client` (Task 2).
- Produces: `getD1Binding(): D1Database | null` — returns the request-scoped D1 binding on Workers, else `null` (off-Workers, dev, tests).

- [ ] **Step 1: Write the failing test for the binding accessor**

```typescript
// lib/db/binding.test.ts
import { describe, it, expect } from 'vitest';
import { getD1Binding } from './binding';

describe('getD1Binding', () => {
  it('returns null when not running on Cloudflare (dev/test)', () => {
    expect(getD1Binding()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/db/binding.test.ts`
Expected: FAIL with "Cannot find module './binding'".

- [ ] **Step 3: Implement `lib/db/binding.ts`**

```typescript
// lib/db/binding.ts
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

interface CfEnv { DB?: D1Database; BUCKET?: R2Bucket; [k: string]: unknown }

/**
 * Returns the Cloudflare request context's env, or null when not on Workers
 * (local `next dev`, Vitest, or the Vercel/Node runtime). Never throws.
 */
function cfEnv(): CfEnv | null {
  try {
    // Lazily required so Node/Vercel builds don't hard-depend on the adapter.
    const { getCloudflareContext } = require('@opennextjs/cloudflare');
    return (getCloudflareContext()?.env as CfEnv) ?? null;
  } catch {
    return null;
  }
}

export function getD1Binding(): D1Database | null {
  return cfEnv()?.DB ?? null;
}

export function getR2Binding(): R2Bucket | null {
  return cfEnv()?.BUCKET ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/db/binding.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `getClient()` in `lib/db.ts` to prefer D1**

Modify `rawClient()` / `getClient()` (lines ~210-239). Replace the body of `rawClient()` so it returns the D1 adapter when a binding exists, else the current libSQL client. Keep the `fs.mkdirSync` call **only** on the `file:` path (it already is):

```typescript
import { createD1Client } from '@/lib/db/d1-adapter';
import { getD1Binding } from '@/lib/db/binding';

// ...

function rawClient(): Client {
  if (client) return client;

  const d1 = getD1Binding();
  if (d1) {
    // Cloudflare: use D1 through the libSQL-shaped adapter.
    client = createD1Client(d1) as unknown as Client;
    return client;
  }

  // Node / Vercel / local / tests: libSQL over Turso or a local file.
  const url = dbUrl();
  if (url.startsWith('file:')) {
    fs.mkdirSync(path.dirname(url.slice('file:'.length)), { recursive: true });
  }
  client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
    intMode: 'number',
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, { ...init, cache: 'no-store' }),
  });
  return client;
}
```

`getClient()` is unchanged: it still calls `c.executeMultiple(SCHEMA).then(() => runMigrations(c))`, which now self-migrates D1 on first request.

- [ ] **Step 6: Run the full suite (file-mode path must be unaffected)**

Run: `npm test`
Expected: PASS (231 tests) — no D1 binding in tests, so the file path is taken exactly as before.

- [ ] **Step 7: Commit**

```bash
git add lib/db/binding.ts lib/db/binding.test.ts lib/db.ts
git commit -m "feat: use D1 when its binding is present, else libSQL file/Turso"
```

---

## Task 4: Storage abstraction (R2 + local disk)

**Files:**
- Create: `lib/storage/index.ts`, `lib/storage/index.test.ts`

**Interfaces:**
- Consumes: `getR2Binding` (Task 3).
- Produces:
  - `putObject(key: string, body: ArrayBuffer | Uint8Array | Blob, opts: { contentType?: string; access: 'public' | 'private' }): Promise<{ key: string; url: string }>`
  - `deleteObjects(keys: string[]): Promise<void>`
  - `getObject(key: string): Promise<{ body: ReadableStream | Buffer; contentType: string } | null>`
  - `keyToUrl(key: string, access: 'public' | 'private'): string`
  - URL rules: `private` → `/api/files/${key}`; `public` on Workers → `${R2_PUBLIC_BASE}/${key}`; `public` locally → `/api/files/${key}`.

- [ ] **Step 1: Write the failing test (local disk impl)**

```typescript
// lib/storage/index.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { putObject, getObject, deleteObjects, keyToUrl } from './index';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('storage (local disk fallback)', () => {
  beforeEach(() => {
    process.env.LOCAL_UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));
  });

  it('puts and gets an object round-trip', async () => {
    const { key, url } = await putObject('certifications/x.txt', Buffer.from('hi'), {
      access: 'private',
      contentType: 'text/plain',
    });
    expect(key).toBe('certifications/x.txt');
    expect(url).toBe('/api/files/certifications/x.txt');
    const got = await getObject(key);
    expect(got?.contentType).toBe('text/plain');
  });

  it('deletes objects', async () => {
    await putObject('media/y.txt', Buffer.from('yo'), { access: 'public' });
    await deleteObjects(['media/y.txt']);
    expect(await getObject('media/y.txt')).toBeNull();
  });

  it('private keyToUrl is always the gated route', () => {
    expect(keyToUrl('certifications/z', 'private')).toBe('/api/files/certifications/z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/storage/index.test.ts`
Expected: FAIL with "Cannot find module './index'".

- [ ] **Step 3: Implement `lib/storage/index.ts`**

```typescript
// lib/storage/index.ts
import fs from 'fs';
import path from 'path';
import { getR2Binding } from '@/lib/db/binding';

type Access = 'public' | 'private';

function localDir(): string {
  return process.env.LOCAL_UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads');
}

export function keyToUrl(key: string, access: Access): string {
  if (access === 'private') return `/api/files/${key}`;
  const base = process.env.R2_PUBLIC_BASE;
  return base ? `${base.replace(/\/$/, '')}/${key}` : `/api/files/${key}`;
}

export async function putObject(
  key: string,
  body: ArrayBuffer | Uint8Array | Blob | Buffer,
  opts: { contentType?: string; access: Access }
): Promise<{ key: string; url: string }> {
  const bucket = getR2Binding();
  if (bucket) {
    await bucket.put(key, body as ArrayBuffer, {
      httpMetadata: opts.contentType ? { contentType: opts.contentType } : undefined,
    });
    return { key, url: keyToUrl(key, opts.access) };
  }
  // Local disk fallback (dev/tests).
  const full = path.join(localDir(), key);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const buf =
    body instanceof Blob ? Buffer.from(await body.arrayBuffer()) : Buffer.from(body as ArrayBuffer);
  fs.writeFileSync(full, buf);
  if (opts.contentType) fs.writeFileSync(`${full}.type`, opts.contentType);
  return { key, url: keyToUrl(key, opts.access) };
}

export async function getObject(
  key: string
): Promise<{ body: ReadableStream | Buffer; contentType: string } | null> {
  const bucket = getR2Binding();
  if (bucket) {
    const obj = await bucket.get(key);
    if (!obj) return null;
    return {
      body: obj.body as unknown as ReadableStream,
      contentType: obj.httpMetadata?.contentType || 'application/octet-stream',
    };
  }
  const full = path.join(localDir(), key);
  if (!fs.existsSync(full)) return null;
  const contentType = fs.existsSync(`${full}.type`)
    ? fs.readFileSync(`${full}.type`, 'utf8')
    : 'application/octet-stream';
  return { body: fs.readFileSync(full), contentType };
}

export async function deleteObjects(keys: string[]): Promise<void> {
  const bucket = getR2Binding();
  if (bucket) {
    await Promise.all(keys.map((k) => bucket.delete(k)));
    return;
  }
  for (const key of keys) {
    const full = path.join(localDir(), key);
    try { fs.rmSync(full, { force: true }); fs.rmSync(`${full}.type`, { force: true }); } catch {}
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/storage/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Ignore the local upload dir in git**

Add `data/uploads/` to `.gitignore` (the `data/` line already covers it, but add explicitly for clarity if needed). No commit noise from local uploads.

- [ ] **Step 6: Commit**

```bash
git add lib/storage/index.ts lib/storage/index.test.ts .gitignore
git commit -m "feat: storage abstraction over R2 with local-disk fallback"
```

---

## Task 5: Auth-gated file route (certificates)

**Files:**
- Create: `app/api/files/[...key]/route.ts`, `app/api/files/route.test.ts`

**Interfaces:**
- Consumes: `getObject` (Task 4), `isAuthed` from `lib/adminAuth.ts`.
- Produces: `GET /api/files/<key>` — streams the object; returns 401 for private `certifications/*` keys when not admin-authed; 404 when missing.

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/files/route.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GET } from '@/app/api/files/[...key]/route';

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

describe('GET /api/files/[...key]', () => {
  beforeEach(() => {
    process.env.LOCAL_UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'files-'));
    const dir = path.join(process.env.LOCAL_UPLOAD_DIR, 'certifications');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.pdf'), 'PDF');
    fs.writeFileSync(path.join(dir, 'a.pdf.type'), 'application/pdf');
  });

  it('401s on a certification file without admin auth', async () => {
    const res = await GET(req('http://x/api/files/certifications/a.pdf'), {
      params: { key: ['certifications', 'a.pdf'] },
    });
    expect(res.status).toBe(401);
  });

  it('404s on a missing key (admin authed)', async () => {
    process.env.ADMIN_PASSWORD = 'pw';
    const res = await GET(
      req('http://x/api/files/certifications/missing.pdf', { cookie: 'wn_admin=' }),
      { params: { key: ['certifications', 'missing.pdf'] } }
    );
    // Unauthed cookie still 401s before 404; assert it is not a 200.
    expect(res.status).not.toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/files/route.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/files/[...key]/route'".

- [ ] **Step 3: Implement the route**

```typescript
// app/api/files/[...key]/route.ts
import { NextResponse } from 'next/server';
import { getObject } from '@/lib/storage';
import { isAuthed } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: { key: string[] } }
): Promise<Response> {
  const key = params.key.join('/');

  // Certificates are sensitive: admin-only. Public media keys stream freely.
  if (key.startsWith('certifications/') && !isAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const obj = await getObject(key);
  if (!obj) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = Buffer.isBuffer(obj.body) ? obj.body : obj.body;
  return new Response(body as BodyInit, {
    headers: { 'Content-Type': obj.contentType, 'Cache-Control': 'private, no-store' },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/files/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/files/[...key]/route.ts" app/api/files/route.test.ts
git commit -m "feat: auth-gated /api/files route for R2-backed certificates"
```

---

## Task 6: Swap the 5 `@vercel/blob` call sites onto `lib/storage`

**Files:**
- Modify: `lib/certificates.ts:2,73`, `app/api/certification/route.ts:2,62`, `app/api/admin/media/upload/route.ts`, `app/api/admin/media/[id]/route.ts:2,26`, `app/api/admin/media/cleanup/route.ts:2,18`

**Interfaces:**
- Consumes: `putObject`, `deleteObjects` (Task 4).
- Produces: no new exports; behaviour identical, storage now R2/local. Media rows keep storing `pathname` (the key) + `url` (from `putObject`).

- [ ] **Step 1: Run the media/upload + certification tests first (capture current green)**

Run: `npm test`
Expected: PASS (231). This is the baseline the refactor must preserve.

- [ ] **Step 2: Replace `put` in `lib/certificates.ts`**

Remove `import { put } from '@vercel/blob';` (line 2). At the call site (line ~73), replace:

```typescript
const { url } = await put(pathname, file, { access: 'public', contentType: file.type });
```
with:
```typescript
import { putObject } from '@/lib/storage';
// ...
const { url } = await putObject(pathname, file, { access: 'private', contentType: file.type });
```
Certificates become **private** (served via the gated route). Keep storing `url` + `pathname` as today.

- [ ] **Step 3: Replace `put` in `app/api/certification/route.ts`**

Remove `import { put } from '@vercel/blob';` (line 2). Replace line ~62:

```typescript
const blob = await put(pathname, file, { access: 'public', contentType: file.type });
```
with:
```typescript
import { putObject } from '@/lib/storage';
// ...
const blob = await putObject(pathname, file, { access: 'private', contentType: file.type });
```
`blob.url` is still the value read afterwards — `putObject` returns `{ key, url }`, so downstream `blob.url` keeps working.

- [ ] **Step 4: Replace `put` in `app/api/admin/media/upload/route.ts`**

Swap the `@vercel/blob` `put` import for `putObject`, using `access: 'public'` (marketing media). Keep the returned `url`/`pathname` written to the `media` row unchanged.

- [ ] **Step 5: Replace `del` in `app/api/admin/media/[id]/route.ts`**

Remove `import { del } from '@vercel/blob';` (line 2). Replace line ~26. The current code deletes by URL; switch to deleting by **key** (the stored `pathname`). Gather the row's `pathname`/`thumbnailPathname` instead of URLs and call:

```typescript
import { deleteObjects } from '@/lib/storage';
// ...
const keys = [row.pathname, row.thumbnailPathname].filter(Boolean) as string[];
if (keys.length) { try { await deleteObjects(keys); } catch (err) { console.error('media cleanup failed', err); } }
```

- [ ] **Step 6: Replace `del` in `app/api/admin/media/cleanup/route.ts`**

Same swap: gather `pathname` keys for the orphaned rows and call `deleteObjects(keys)` instead of `del(urls)`.

- [ ] **Step 7: Verify the full suite still passes**

Run: `npm test`
Expected: PASS (231). If any test asserted a `blob.vercel-storage.com` URL, update it to assert the `/api/files/...` (private) or `R2_PUBLIC_BASE` (public) shape.

- [ ] **Step 8: Remove the now-unused dependency**

```bash
npm uninstall @vercel/blob
```
Run: `npm test` → Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/certificates.ts app/api/certification/route.ts "app/api/admin/media/upload/route.ts" "app/api/admin/media/[id]/route.ts" app/api/admin/media/cleanup/route.ts package.json package-lock.json
git commit -m "refactor: move file storage from Vercel Blob to lib/storage (R2)"
```

---

## Task 7: Make email Workers-safe (lazy `nodemailer`)

**Files:**
- Modify: `lib/providers/email.ts`

**Interfaces:**
- Consumes: existing `resendConfigured`/`sendResendEmail`, `smtpConfigured`/`sendSmtpEmail`.
- Produces: `getEmailProvider()` unchanged in behaviour, but `nodemailer` (via `smtp.ts`) is only imported at runtime in a Node environment — never statically bundled into the Worker.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/providers/email.test.ts  (add if not present)
import { describe, it, expect, beforeEach } from 'vitest';
import { getEmailProvider } from './email';

describe('getEmailProvider', () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM;
    delete process.env.GMAIL_USER; delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.MAILCHIMP_API_KEY; delete process.env.MAILCHIMP_AUDIENCE_ID;
  });
  it('falls back to mock with no keys', () => {
    expect(getEmailProvider().name).toBe('mock');
  });
  it('prefers resend when keyed', () => {
    process.env.RESEND_API_KEY = 'x'; process.env.EMAIL_FROM = 'a@b.com';
    expect(getEmailProvider().name).toBe('resend');
  });
});
```

- [ ] **Step 2: Run test to verify current state**

Run: `npx vitest run lib/providers/email.test.ts`
Expected: PASS for `resend`/`mock` (behaviour already correct) — this test locks in behaviour before the import refactor.

- [ ] **Step 3: Make the SMTP import lazy**

In `lib/providers/email.ts`, remove the static `import { smtpConfigured, sendSmtpEmail } from './smtp';`. Keep `resendConfigured` static (it has no Node-only deps). Replace the `smtpEmail` provider so it loads `smtp.ts` (and thus `nodemailer`) only when actually used:

```typescript
// Gmail SMTP — Node-only (nodemailer). Loaded lazily so it never bundles on Workers.
const smtpEmail: EmailProvider = {
  name: 'smtp',
  async sendWelcome({ name, email, code, link }): Promise<SyncResult> {
    const { sendSmtpEmail } = await import('./smtp');
    const { subject, html } = welcomeEmail({ name, email, code, link });
    return sendSmtpEmail({ to: email, subject, html });
  },
};

function smtpConfiguredEnv(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}
```
Update `getEmailProvider()` to call `smtpConfiguredEnv()` instead of the imported `smtpConfigured()` (same check, no static import of `smtp.ts`). Resend stays first, so on Cloudflare (RESEND_API_KEY set) SMTP is never reached.

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/providers/email.test.ts && npm test`
Expected: PASS (231).

- [ ] **Step 5: Verify the Worker build no longer bundles nodemailer**

Run: `npx opennextjs-cloudflare build`
Expected: build succeeds (no `nodemailer`/Node-builtin resolution error from the email path).

- [ ] **Step 6: Commit**

```bash
git add lib/providers/email.ts lib/providers/email.test.ts
git commit -m "refactor: lazy-load SMTP so nodemailer never bundles on Workers"
```

---

## Task 8: Cron via Cloudflare Cron Triggers

**Files:**
- Create: `worker.ts`, `worker.test.ts`
- Modify: `open-next.config.ts` (point at the custom entry), `wrangler.toml` (already has triggers from Task 1)

**Interfaces:**
- Consumes: the existing cron HTTP routes `/api/cron/run` (schedule `0 6 * * *`) and `/api/cron/chat-alerts` (`0 7 * * *`), both guarded by `CRON_SECRET`.
- Produces: a `scheduled(event, env, ctx)` handler that maps `event.cron` → the matching route path and self-fetches it with the `CRON_SECRET` bearer.

- [ ] **Step 1: Write the failing test for the cron→path mapping**

```typescript
// worker.test.ts
import { describe, it, expect } from 'vitest';
import { cronPathFor } from './worker';

describe('cronPathFor', () => {
  it('maps the 6am trigger to the automation run', () => {
    expect(cronPathFor('0 6 * * *')).toBe('/api/cron/run');
  });
  it('maps the 7am trigger to chat alerts', () => {
    expect(cronPathFor('0 7 * * *')).toBe('/api/cron/chat-alerts');
  });
  it('returns null for an unknown schedule', () => {
    expect(cronPathFor('* * * * *')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker.test.ts`
Expected: FAIL with "Cannot find module './worker'".

- [ ] **Step 3: Implement `worker.ts`**

```typescript
// worker.ts
// Custom Worker entry: OpenNext handles fetch; we add scheduled() for cron.
import { default as handler } from './.open-next/worker.js';

const CRON_MAP: Record<string, string> = {
  '0 6 * * *': '/api/cron/run',
  '0 7 * * *': '/api/cron/chat-alerts',
};

export function cronPathFor(cron: string): string | null {
  return CRON_MAP[cron] ?? null;
}

export default {
  fetch: handler.fetch,
  async scheduled(event: { cron: string }, env: Record<string, string>, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const path = cronPathFor(event.cron);
    if (!path) return;
    const base = env.PORTAL_URL || 'http://localhost:8787';
    ctx.waitUntil(
      fetch(`${base}${path}`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } })
    );
  },
};
```

> Note: `worker.test.ts` imports only `cronPathFor`; the `./.open-next/worker.js` import is resolved at build time by Wrangler, not by Vitest. If Vitest tries to resolve it, split `cronPathFor` + `CRON_MAP` into `lib/cron/map.ts` and import that from both `worker.ts` and the test. (Prefer the split to keep the test hermetic.)

- [ ] **Step 4: Point OpenNext/Wrangler at the custom entry**

Set `main = "worker.ts"` handling per the OpenNext custom-worker docs (OpenNext emits `.open-next/worker.js`; the custom `worker.ts` re-exports it and adds `scheduled`). Update `wrangler.toml` `main` if the OpenNext version requires the wrapper as the entry.

- [ ] **Step 5: Run tests**

Run: `npx vitest run worker.test.ts && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add worker.ts worker.test.ts open-next.config.ts wrangler.toml
git commit -m "feat: Cloudflare cron triggers via scheduled() handler"
```

---

## Task 9: Runtime compatibility sweep

**Files:**
- Modify: as needed from the audit (guards only; no behaviour change).

**Interfaces:**
- Consumes: nothing new.
- Produces: a clean `opennextjs-cloudflare build` with `nodejs_compat` covering remaining Node APIs.

- [ ] **Step 1: Enumerate Node-only usage**

Run:
```bash
grep -rnE "from 'fs'|from 'path'|from 'crypto'|require\('fs'\)|process\.cwd\(\)|Buffer\." lib app --include=*.ts --include=*.tsx | grep -v ".test.ts"
```
Expected: the known sites — `lib/db.ts` (`fs`/`path`, already guarded to file mode), `lib/db/binding.ts`, `lib/storage/index.ts` (local fallback only, never hit on Workers), and `crypto`/`Buffer` uses (covered by `nodejs_compat`).

- [ ] **Step 2: Confirm the AI path needs no change**

`lib/ai/factory.ts` and `lib/ai/assistant.ts` call Gemini via `fetch(https://generativelanguage.googleapis.com/...)` — Workers-native. No SDK. Confirm no `fs`/`Buffer` in the AI request path; add `GEMINI_API_KEY`/`GEMINI_API_KEY2` to the go-live secrets list (Task 10).

- [ ] **Step 3: Build for Workers and resolve any remaining resolution errors**

Run: `npx opennextjs-cloudflare build`
Expected: success. If a Node builtin fails to resolve, either it is already `nodejs_compat`-covered (add the flag — already set) or the offending import is Node-only and must be made lazy (as done for `nodemailer` in Task 7). Fix per-case.

- [ ] **Step 4: Full test run**

Run: `npm test`
Expected: PASS (231).

- [ ] **Step 5: Commit (if any guards were added)**

```bash
git add -A
git commit -m "chore: runtime-compat sweep for Workers build"
```

---

## Task 10: Go-live docs + git-connected deploy

**Files:**
- Create: `docs/CLOUDFLARE_GO_LIVE.md`
- Modify: `docs/superpowers/specs/2026-08-17-cloudflare-migration-design.md` (correct test count to 231; note email moves SMTP→Resend; add Gemini keys)

**Interfaces:**
- Consumes: everything above.
- Produces: the operator checklist for deploying from the (browser-only) office laptop.

- [ ] **Step 1: Write `docs/CLOUDFLARE_GO_LIVE.md`**

Contents:
1. In the Cloudflare dashboard: create a **D1 database** (`practitioner-portal`) and an **R2 bucket** (`practitioner-portal-media`); enable public access on the bucket and note the public base URL.
2. Put the D1 `database_id` and R2 bucket name into `wrangler.toml`.
3. Set secrets (dashboard or `wrangler secret put`): `RESEND_API_KEY`, `EMAIL_FROM` (verified sender), `GEMINI_API_KEY`, `GEMINI_API_KEY2`, `ANTHROPIC_API_KEY` (optional), `ADMIN_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`, `R2_PUBLIC_BASE`, `PORTAL_URL`.
4. Connect the **work repo** to Cloudflare (Workers Builds / Pages Git integration): build command `npx opennextjs-cloudflare build`, deploy on push to the working branch. This is fully browser-based — no local install on the office laptop.
5. First deploy self-migrates D1 on first request (or run `wrangler d1 migrations`/`execute` once if preferred).
6. Smoke test: apply flow → admin login → media upload (public R2 URL) → open a certification via `/api/files/...` (gated) → trigger `/api/cron/run` with the secret.

- [ ] **Step 2: Correct the spec's stale facts**

In the design spec, change "≈144 tests" to **231**, note that production email is currently Gmail SMTP and moves to Resend on Cloudflare (load-bearing, not cosmetic), and add the Gemini keys to §6 secrets.

- [ ] **Step 3: Commit**

```bash
git add docs/CLOUDFLARE_GO_LIVE.md docs/superpowers/specs/2026-08-17-cloudflare-migration-design.md
git commit -m "docs: Cloudflare go-live checklist + spec corrections"
```

- [ ] **Step 4: Push the branch to the work repo**

The push to `utkarshrawat123` requires work-account auth (this Mac is signed into the personal account). Run in a local Terminal with a work-account token, or from a machine signed into the work account:

```bash
git push newrepo cloudflare-migration
```
Expected: branch appears on `utkarshrawat123/Practitioner_portal`; `main` there is untouched.

---

## Self-Review

**Spec coverage:**
- §4/§5.1 hosting → Task 1. §5.2 D1 → Tasks 2–3. §5.3 R2 → Tasks 4–6. §5.4 email → Task 7. §5.5 cron → Task 8. §5.6 AI → Task 9 (verify-only, already `fetch`). §5.7 runtime sweep → Task 9. §6 secrets → Tasks 1 + 10. §7 local dev → Task 1 docs. §8 go-live → Task 10. §9 branch strategy → Task 10 Step 4. §11 decisions (gated certs / public media / git-CI / empty D1) → Tasks 5, 6, 10. No gaps.

**Placeholder scan:** all steps carry real code or exact commands. `PLACEHOLDER_D1_ID` in `wrangler.toml` is an intentional, documented placeholder replaced at go-live — not a plan gap.

**Type consistency:** `createD1Client` returns `{ execute, executeMultiple, batch, close }` used by `lib/db.ts`. Storage exports `putObject`/`deleteObjects`/`getObject`/`keyToUrl` — consumed consistently in Tasks 5–6. `getD1Binding`/`getR2Binding` from `lib/db/binding.ts` used in Tasks 3–4. `cronPathFor` defined and tested in Task 8. Consistent throughout.

**Open risk to flag at execution:** OpenNext's exact custom-worker wiring (Task 8 Step 4) and the `.open-next/worker.js` entry path can vary by `@opennextjs/cloudflare` version — verify against the installed version's docs during execution and adjust `main`/`open-next.config.ts` accordingly. Prefer splitting `cronPathFor` into `lib/cron/map.ts` for a hermetic unit test.
