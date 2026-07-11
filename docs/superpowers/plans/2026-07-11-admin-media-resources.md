# Admin Full-Width Layout + Media/Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen the `/admin` UI to full width, and add a Media/Resources feature — admins upload files or add links (with thumbnails) in a new admin Media tab; approved practitioners browse them on a new `/resources` page.

**Architecture:** Files upload directly from the browser to Vercel Blob (client-upload, bypassing the 4.5 MB serverless body cap); only metadata is stored in a new `media` table in the existing libSQL/Turso database. Thumbnails are auto-derived for YouTube/Vimeo/OG links and image files, and admin-uploaded otherwise. A shared `MediaCard` renders files and links identically in both the admin list and the practitioner grid.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, `@libsql/client`, `@vercel/blob`, Vitest.

## Global Constraints

- All `lib/db.ts` functions are **async**; always `await`. Tests use `execForTests(sql, args)` and `resetDbForTests()`; set `process.env.DB_PATH` to a temp file per test (see existing `tests/lessons-db.test.ts`).
- Admin API routes guard with `isAuthed(req)` from `@/lib/adminAuth` → 401 `{ error: 'Unauthorised' }`. Practitioner routes guard with `getSessionPractitioner(req)` from `@/lib/practitionerAuth` and require `p.status === 'approved'`.
- Every route file: `export const dynamic = 'force-dynamic';`.
- Brand tokens (Tailwind): `ink` `#191919`, `terracotta` `#a45248`, `cream` `#f8f6f3`, `sage` `#d0d1ab`, `stone` `#e6e3df`, `forest` `#3a4f41`, `ink2`. Fonts `font-heading` (Gestura). Match existing component styling.
- Media `type` stored values: `video`, `document`, `slides`, `image`. `content_kind` values: `file`, `link`.
- NEVER reference `care@wildnutrition.com` anywhere. Contact address is `utkarshrawatofficial@gmail.com`.
- Run the full suite with `npm test`; it must stay green. Build with `npm run build`.

---

### Task 1: `media` table + db helpers

**Files:**
- Modify: `lib/db.ts` (add to `SCHEMA` string; add `MediaRow` interface, `rowToMedia`, and CRUD helpers near the lessons helpers ~line 560)
- Test: `tests/media-db.test.ts` (create)

**Interfaces:**
- Produces:
  - `interface MediaRow { id: number; title: string; type: 'video'|'document'|'slides'|'image'; description: string | null; contentKind: 'file'|'link'; url: string; pathname: string | null; thumbnailUrl: string | null; thumbnailPathname: string | null; size: number | null; published: boolean; createdAt: string }`
  - `createMedia(m: { title: string; type: string; description: string | null; contentKind: 'file'|'link'; url: string; pathname: string | null; thumbnailUrl: string | null; thumbnailPathname: string | null; size: number | null }): Promise<number>`
  - `listMedia(): Promise<MediaRow[]>` — all rows, newest first
  - `listPublishedMedia(type?: string): Promise<MediaRow[]>` — `published = 1` only, optional type filter, newest first
  - `getMedia(id: number): Promise<MediaRow | null>`
  - `setMediaPublished(id: number, published: boolean): Promise<MediaRow>`
  - `deleteMedia(id: number): Promise<void>`

- [ ] **Step 1: Add the table to the `SCHEMA` string**

In `lib/db.ts`, inside the `const SCHEMA = \`...\`;` template (after the `login_events` table, before the closing backtick), add:

```sql
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  content_kind TEXT NOT NULL,
  url TEXT NOT NULL,
  pathname TEXT,
  thumbnail_url TEXT,
  thumbnail_pathname TEXT,
  size INTEGER,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Write the failing test**

Create `tests/media-db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-media-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

const fileItem = (over: Record<string, unknown> = {}) => ({
  title: 'Protocol Guide',
  type: 'document',
  description: 'A PDF guide',
  contentKind: 'file' as const,
  url: 'https://blob.example/media/guide.pdf',
  pathname: 'media/guide.pdf',
  thumbnailUrl: 'https://blob.example/thumbnails/guide.png',
  thumbnailPathname: 'thumbnails/guide.png',
  size: 12345,
  ...over,
});

describe('media db', () => {
  it('creates and reads back a media item', async () => {
    const db = await import('@/lib/db');
    const id = await db.createMedia(fileItem());
    const row = await db.getMedia(id);
    expect(row).not.toBeNull();
    expect(row!.title).toBe('Protocol Guide');
    expect(row!.contentKind).toBe('file');
    expect(row!.published).toBe(true);
    expect(row!.size).toBe(12345);
  });

  it('listPublishedMedia excludes hidden rows and filters by type', async () => {
    const db = await import('@/lib/db');
    const a = await db.createMedia(fileItem({ title: 'Doc A', type: 'document' }));
    await db.createMedia(fileItem({ title: 'Vid B', type: 'video', contentKind: 'link', url: 'https://youtu.be/x', pathname: null }));
    await db.setMediaPublished(a, false);
    const published = await db.listPublishedMedia();
    expect(published.map((m) => m.title)).toEqual(['Vid B']);
    const videos = await db.listPublishedMedia('video');
    expect(videos).toHaveLength(1);
    const docs = await db.listPublishedMedia('document');
    expect(docs).toHaveLength(0); // Doc A is hidden
  });

  it('deletes a media item', async () => {
    const db = await import('@/lib/db');
    const id = await db.createMedia(fileItem());
    await db.deleteMedia(id);
    expect(await db.getMedia(id)).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- media-db`
Expected: FAIL — `db.createMedia is not a function`.

- [ ] **Step 4: Add the helpers**

In `lib/db.ts`, after the lessons helpers (near line 560, before the reporting helpers), add the interface at the top with the other interfaces and the helpers in the helpers region:

```typescript
export interface MediaRow {
  id: number;
  title: string;
  type: 'video' | 'document' | 'slides' | 'image';
  description: string | null;
  contentKind: 'file' | 'link';
  url: string;
  pathname: string | null;
  thumbnailUrl: string | null;
  thumbnailPathname: string | null;
  size: number | null;
  published: boolean;
  createdAt: string;
}

function rowToMedia(r: Row): MediaRow {
  return {
    id: num(r.id),
    title: r.title as string,
    type: r.type as MediaRow['type'],
    description: (r.description as string | null) ?? null,
    contentKind: r.content_kind as 'file' | 'link',
    url: r.url as string,
    pathname: (r.pathname as string | null) ?? null,
    thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
    thumbnailPathname: (r.thumbnail_pathname as string | null) ?? null,
    size: r.size === null ? null : num(r.size),
    published: num(r.published) === 1,
    createdAt: r.created_at as string,
  };
}

export async function createMedia(m: {
  title: string;
  type: string;
  description: string | null;
  contentKind: 'file' | 'link';
  url: string;
  pathname: string | null;
  thumbnailUrl: string | null;
  thumbnailPathname: string | null;
  size: number | null;
}): Promise<number> {
  const res = await run(
    `INSERT INTO media
      (title, type, description, content_kind, url, pathname, thumbnail_url, thumbnail_pathname, size)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [m.title, m.type, m.description, m.contentKind, m.url, m.pathname, m.thumbnailUrl, m.thumbnailPathname, m.size]
  );
  return res.lastInsertRowid;
}

export async function getMedia(id: number): Promise<MediaRow | null> {
  const row = await one(`SELECT * FROM media WHERE id = ?`, [id]);
  return row ? rowToMedia(row) : null;
}

export async function listMedia(): Promise<MediaRow[]> {
  const rows = await all(`SELECT * FROM media ORDER BY id DESC`);
  return rows.map(rowToMedia);
}

export async function listPublishedMedia(type?: string): Promise<MediaRow[]> {
  const rows = type
    ? await all(`SELECT * FROM media WHERE published = 1 AND type = ? ORDER BY id DESC`, [type])
    : await all(`SELECT * FROM media WHERE published = 1 ORDER BY id DESC`);
  return rows.map(rowToMedia);
}

export async function setMediaPublished(id: number, published: boolean): Promise<MediaRow> {
  await run(`UPDATE media SET published = ? WHERE id = ?`, [published ? 1 : 0, id]);
  return (await getMedia(id))!;
}

export async function deleteMedia(id: number): Promise<void> {
  await run(`DELETE FROM media WHERE id = ?`, [id]);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- media-db`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts tests/media-db.test.ts
git commit -m "feat: add media table and db helpers"
```

---

### Task 2: Thumbnail resolver (`lib/media/thumbnail.ts`)

**Files:**
- Create: `lib/media/thumbnail.ts`
- Test: `tests/media-thumbnail.test.ts`

**Interfaces:**
- Produces: `resolveLinkThumbnail(rawUrl: string): Promise<string | null>` — returns a thumbnail URL for a link, or `null` if none can be derived. Never throws.
  - YouTube (`youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/embed/ID`) → `https://img.youtube.com/vi/<ID>/hqdefault.jpg` (no network call).
  - Vimeo (`vimeo.com/<digits>`) → fetch `https://vimeo.com/api/oembed.json?url=<encoded>` and return `thumbnail_url`.
  - Otherwise → fetch the page HTML and return the `og:image` content, else `null`.
- Also export `parseYouTubeId(url: string): string | null` (used by the YouTube branch and unit-tested directly).

- [ ] **Step 1: Write the failing test**

Create `tests/media-thumbnail.test.ts`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolveLinkThumbnail, parseYouTubeId } from '@/lib/media/thumbnail';

afterEach(() => vi.unstubAllGlobals());

describe('parseYouTubeId', () => {
  it('parses watch, short and embed URLs', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=abc123XYZ_-')).toBe('abc123XYZ_-');
    expect(parseYouTubeId('https://youtu.be/abc123XYZ_-')).toBe('abc123XYZ_-');
    expect(parseYouTubeId('https://www.youtube.com/embed/abc123XYZ_-')).toBe('abc123XYZ_-');
    expect(parseYouTubeId('https://example.com/x')).toBeNull();
  });
});

describe('resolveLinkThumbnail', () => {
  it('returns the YouTube thumbnail without a network call', async () => {
    const url = await resolveLinkThumbnail('https://youtu.be/abc123XYZ_-');
    expect(url).toBe('https://img.youtube.com/vi/abc123XYZ_-/hqdefault.jpg');
  });

  it('returns the Vimeo oEmbed thumbnail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ thumbnail_url: 'https://i.vimeocdn.com/x.jpg' }), { status: 200 })
    ));
    const url = await resolveLinkThumbnail('https://vimeo.com/123456');
    expect(url).toBe('https://i.vimeocdn.com/x.jpg');
  });

  it('falls back to og:image for a generic link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('<html><head><meta property="og:image" content="https://site.example/og.png"></head></html>', { status: 200 })
    ));
    const url = await resolveLinkThumbnail('https://site.example/article');
    expect(url).toBe('https://site.example/og.png');
  });

  it('returns null (never throws) on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
    expect(await resolveLinkThumbnail('https://site.example/x')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- media-thumbnail`
Expected: FAIL — cannot find module `@/lib/media/thumbnail`.

- [ ] **Step 3: Implement the resolver**

Create `lib/media/thumbnail.ts`:

```typescript
const TIMEOUT_MS = 8000;

export function parseYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Best-effort thumbnail URL for an external link. Never throws; returns null when unknown. */
export async function resolveLinkThumbnail(rawUrl: string): Promise<string | null> {
  try {
    const ytId = parseYouTubeId(rawUrl);
    if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

    if (/vimeo\.com\/\d+/.test(rawUrl)) {
      const res = await fetch(
        `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(rawUrl)}`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) }
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { thumbnail_url?: string };
      return json.thumbnail_url ?? null;
    }

    const res = await fetch(rawUrl, {
      headers: { 'User-Agent': 'WildNutritionPractitionerPortal/1.0 (+utkarshrawatofficial@gmail.com)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- media-thumbnail`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/media/thumbnail.ts tests/media-thumbnail.test.ts
git commit -m "feat: add link thumbnail resolver"
```

---

### Task 3: Install `@vercel/blob` + upload-token route

**Files:**
- Modify: `package.json` (add `@vercel/blob`)
- Create: `app/api/admin/media/upload/route.ts`

**Interfaces:**
- Produces: `POST /api/admin/media/upload` — returns the Blob client-upload token JSON via `handleUpload`. Admin-guarded.

- [ ] **Step 1: Install the dependency**

Run: `npm install @vercel/blob`
Expected: adds `@vercel/blob` to `package.json` dependencies.

- [ ] **Step 2: Create the upload-token route**

Create `app/api/admin/media/upload/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { isAuthed } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

// Returns a signed token so the browser can upload directly to Vercel Blob,
// bypassing the ~4.5 MB serverless request-body limit.
export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'image/*', 'application/pdf', 'video/*',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/vnd.ms-powerpoint',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        maximumSizeInBytes: 500 * 1024 * 1024,
      }),
      onUploadCompleted: async () => { /* metadata is saved by a separate call */ },
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 3: Verify build/type-check**

Run: `npm run build`
Expected: build succeeds (route compiles). No test for this route (thin wrapper over `handleUpload`; exercised manually in Task 9).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app/api/admin/media/upload/route.ts
git commit -m "feat: add Vercel Blob upload-token route"
```

---

### Task 4: Admin media metadata + thumbnail routes

**Files:**
- Create: `app/api/admin/media/route.ts` (GET list, POST save)
- Create: `app/api/admin/media/thumbnail/route.ts` (GET resolve link thumbnail)
- Create: `app/api/admin/media/[id]/route.ts` (PATCH publish toggle, DELETE)
- Test: `tests/api-admin-media.test.ts`

**Interfaces:**
- Consumes: `createMedia`, `listMedia`, `getMedia`, `setMediaPublished`, `deleteMedia` (Task 1); `resolveLinkThumbnail` (Task 2); `isAuthed` (`@/lib/adminAuth`); `del` from `@vercel/blob`.
- Produces:
  - `GET /api/admin/media` → `{ media: MediaRow[] }`
  - `POST /api/admin/media` body `{ title, type, description?, contentKind, url, pathname?, thumbnailUrl?, thumbnailPathname?, size? }` → `{ media: MediaRow }` (201)
  - `GET /api/admin/media/thumbnail?url=` → `{ thumbnailUrl: string | null }`
  - `PATCH /api/admin/media/[id]` body `{ published: boolean }` → `{ media: MediaRow }`
  - `DELETE /api/admin/media/[id]` → `{ ok: true }` (also deletes Blob file + thumbnail when present)

- [ ] **Step 1: Write the failing test**

Create `tests/api-admin-media.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Blob del() is mocked so DELETE never hits the network.
vi.mock('@vercel/blob', () => ({ del: vi.fn(async () => {}) }));

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-apimedia-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'pw';
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function adminCookie(): Promise<string> {
  const { adminToken } = await import('@/lib/adminAuth');
  return `wn_admin=${adminToken()}`;
}

const payload = {
  title: 'Guide', type: 'document', description: 'x',
  contentKind: 'file', url: 'https://blob/x.pdf', pathname: 'media/x.pdf',
  thumbnailUrl: 'https://blob/t.png', thumbnailPathname: 'thumbnails/t.png', size: 10,
};

describe('/api/admin/media', () => {
  it('401s without the admin cookie', async () => {
    const { GET } = await import('@/app/api/admin/media/route');
    const res = await GET(new Request('http://x/api/admin/media'));
    expect(res.status).toBe(401);
  });

  it('saves and lists media with the cookie', async () => {
    const cookie = await adminCookie();
    const { POST, GET } = await import('@/app/api/admin/media/route');
    const post = await POST(new Request('http://x/api/admin/media', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(payload),
    }));
    expect(post.status).toBe(201);
    const list = await GET(new Request('http://x/api/admin/media', { headers: { cookie } }));
    expect(list.status).toBe(200);
    expect((await list.json()).media).toHaveLength(1);
  });

  it('rejects an invalid type', async () => {
    const cookie = await adminCookie();
    const { POST } = await import('@/app/api/admin/media/route');
    const res = await POST(new Request('http://x/api/admin/media', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ ...payload, type: 'bogus' }),
    }));
    expect(res.status).toBe(400);
  });

  it('resolves a YouTube thumbnail via the thumbnail route', async () => {
    const cookie = await adminCookie();
    const { GET } = await import('@/app/api/admin/media/thumbnail/route');
    const res = await GET(new Request('http://x/api/admin/media/thumbnail?url=' + encodeURIComponent('https://youtu.be/abc123XYZ_-'), { headers: { cookie } }));
    expect((await res.json()).thumbnailUrl).toBe('https://img.youtube.com/vi/abc123XYZ_-/hqdefault.jpg');
  });

  it('toggles published and deletes', async () => {
    const cookie = await adminCookie();
    const { POST } = await import('@/app/api/admin/media/route');
    await POST(new Request('http://x/api/admin/media', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(payload),
    }));
    const mod = await import('@/app/api/admin/media/[id]/route');
    const patch = await mod.PATCH(
      new Request('http://x/api/admin/media/1', { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ published: false }) }),
      { params: { id: '1' } }
    );
    expect((await patch.json()).media.published).toBe(false);
    const del = await mod.DELETE(
      new Request('http://x/api/admin/media/1', { method: 'DELETE', headers: { cookie } }),
      { params: { id: '1' } }
    );
    expect(del.status).toBe(200);
    expect(await (await import('@/lib/db')).getMedia(1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- api-admin-media`
Expected: FAIL — cannot find the route modules.

- [ ] **Step 3: Create `app/api/admin/media/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { createMedia, getMedia, listMedia } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(['video', 'document', 'slides', 'image']),
  description: z.string().trim().max(2000).optional().nullable(),
  contentKind: z.enum(['file', 'link']),
  url: z.string().url(),
  pathname: z.string().optional().nullable(),
  thumbnailUrl: z.string().url().optional().nullable(),
  thumbnailPathname: z.string().optional().nullable(),
  size: z.number().int().nonnegative().optional().nullable(),
});

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  return NextResponse.json({ media: await listMedia() });
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
  const id = await createMedia({
    title: d.title,
    type: d.type,
    description: d.description ?? null,
    contentKind: d.contentKind,
    url: d.url,
    pathname: d.pathname ?? null,
    thumbnailUrl: d.thumbnailUrl ?? null,
    thumbnailPathname: d.thumbnailPathname ?? null,
    size: d.size ?? null,
  });
  return NextResponse.json({ media: await getMedia(id) }, { status: 201 });
}
```

- [ ] **Step 4: Create `app/api/admin/media/thumbnail/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { resolveLinkThumbnail } from '@/lib/media/thumbnail';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const url = new URL(req.url).searchParams.get('url');
  if (!url) return NextResponse.json({ thumbnailUrl: null });
  return NextResponse.json({ thumbnailUrl: await resolveLinkThumbnail(url) });
}
```

- [ ] **Step 5: Create `app/api/admin/media/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { isAuthed } from '@/lib/adminAuth';
import { getMedia, setMediaPublished, deleteMedia } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  if (!(await getMedia(id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { published?: boolean };
  if (typeof body.published !== 'boolean') return NextResponse.json({ error: 'published must be boolean' }, { status: 400 });
  return NextResponse.json({ media: await setMediaPublished(id, body.published) });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  const item = await getMedia(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Best-effort: remove any Blob-hosted file + uploaded thumbnail. Links have null pathnames.
  const urls = [item.pathname && item.url, item.thumbnailPathname && item.thumbnailUrl].filter(Boolean) as string[];
  if (urls.length) { try { await del(urls); } catch { /* ignore blob cleanup errors */ } }
  await deleteMedia(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- api-admin-media`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add app/api/admin/media tests/api-admin-media.test.ts
git commit -m "feat: add admin media metadata, thumbnail and item routes"
```

---

### Task 5: Practitioner `/api/resources` route

**Files:**
- Create: `app/api/resources/route.ts`
- Test: `tests/api-resources.test.ts`

**Interfaces:**
- Consumes: `getSessionPractitioner` (`@/lib/practitionerAuth`), `listPublishedMedia` (Task 1).
- Produces: `GET /api/resources?type=` → `{ media: MediaRow[] }` (published only); 401 without an approved session.

- [ ] **Step 1: Write the failing test**

Create `tests/api-resources.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- api-resources`
Expected: FAIL — cannot find `@/app/api/resources/route`.

- [ ] **Step 3: Create `app/api/resources/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { listPublishedMedia } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const type = new URL(req.url).searchParams.get('type') ?? undefined;
  return NextResponse.json({ media: await listPublishedMedia(type) });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- api-resources`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/resources/route.ts tests/api-resources.test.ts
git commit -m "feat: add practitioner resources API"
```

---

### Task 6: Shared `MediaCard` component

**Files:**
- Create: `components/MediaCard.tsx`

**Interfaces:**
- Produces: default export `MediaCard(props: { item: MediaCardItem; children?: React.ReactNode })` where
  `interface MediaCardItem { title: string; type: 'video'|'document'|'slides'|'image'; description: string | null; url: string; thumbnailUrl: string | null }`.
  Renders identical markup for files and links: a 16:9 thumbnail (falls back to a type-labelled tinted block when `thumbnailUrl` is null), title, a type badge, description, an "Open / Download" anchor (`href={item.url}` `target="_blank" rel="noreferrer"`), and any `children` (admin controls) below the action.

- [ ] **Step 1: Create the component**

Create `components/MediaCard.tsx`:

```tsx
export interface MediaCardItem {
  title: string;
  type: 'video' | 'document' | 'slides' | 'image';
  description: string | null;
  url: string;
  thumbnailUrl: string | null;
}

const TYPE_LABEL: Record<MediaCardItem['type'], string> = {
  video: 'Video',
  document: 'Document',
  slides: 'Slides',
  image: 'Image',
};

export default function MediaCard({ item, children }: { item: MediaCardItem; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden border border-stone bg-white">
      <div className="relative aspect-video bg-cream">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-sage/40 text-xs uppercase tracking-[0.2em] text-forest">
            {TYPE_LABEL[item.type]}
          </div>
        )}
        <span className="absolute left-2 top-2 bg-ink/80 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-cream">
          {TYPE_LABEL[item.type]}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-heading text-lg text-ink">{item.title}</h3>
        {item.description && <p className="mt-1 flex-1 text-sm text-ink2/80">{item.description}</p>}
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block self-start bg-ink px-5 py-2 text-xs uppercase tracking-[0.15em] text-cream transition-colors hover:bg-terracotta"
        >
          Open / Download
        </a>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: build succeeds (component compiles; not yet imported anywhere — that's fine, Next.js compiles it when imported in later tasks. If the build tree-shakes unused files, this step just confirms no syntax/type errors — alternatively confirm via `npx tsc --noEmit`).

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add components/MediaCard.tsx
git commit -m "feat: add shared MediaCard component"
```

---

### Task 7: Admin Media tab (`components/AdminMedia.tsx`) + wire into dashboard

**Files:**
- Create: `components/AdminMedia.tsx`
- Modify: `components/AdminDashboard.tsx` (add `media` to `TABS`, to the self-loading tab list, and to the panel switch)

**Interfaces:**
- Consumes: `MediaCard` (Task 6); `upload` from `@vercel/blob/client`; the admin routes from Task 4.
- Produces: default export `AdminMedia()` — self-contained tab panel.

- [ ] **Step 1: Add `media` to `AdminDashboard` TABS + self-loading list + panel switch**

In `components/AdminDashboard.tsx`:

Add to the `TABS` array (after `reporting`):
```tsx
  { id: 'media', label: 'Media' },
```

Update the self-loading guard in `load` (the `if (currentTab === 'ai' || ...)` line) to include `media`:
```tsx
    if (currentTab === 'ai' || currentTab === 'lessons' || currentTab === 'reporting' || currentTab === 'media') {
```

Add the import at the top with the other admin panel imports:
```tsx
import AdminMedia from '@/components/AdminMedia';
```

Add to the panel switch (after the `reporting` branch, before the final `) : (`):
```tsx
      ) : tab === 'media' ? (
        <AdminMedia />
```

- [ ] **Step 2: Create `components/AdminMedia.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import MediaCard from '@/components/MediaCard';

interface MediaRow {
  id: number; title: string; type: 'video' | 'document' | 'slides' | 'image';
  description: string | null; contentKind: 'file' | 'link'; url: string;
  thumbnailUrl: string | null; published: boolean; size: number | null;
}

const TYPES = [
  { id: 'video', label: 'Video' },
  { id: 'document', label: 'PDF / Document' },
  { id: 'slides', label: 'Presentation / Slides' },
  { id: 'image', label: 'Image / Infographic' },
] as const;

const input = 'w-full border border-stone px-3 py-2 text-sm focus:border-terracotta focus:outline-none';
const label = 'mb-1 block text-xs uppercase tracking-[0.15em] text-ink2';

export default function AdminMedia() {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MediaRow['type']>('document');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<'file' | 'link'>('file');
  const [linkUrl, setLinkUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [thumbNeeded, setThumbNeeded] = useState(false);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);

  const loadRows = useCallback(async () => {
    const res = await fetch('/api/admin/media');
    if (res.ok) setRows((await res.json()).media);
  }, []);
  useEffect(() => { loadRows(); }, [loadRows]);

  // When a link is pasted, ask the server for an auto thumbnail; require an upload if none.
  async function resolveLinkThumb(url: string) {
    setThumbPreview(null); setThumbNeeded(false);
    if (!url.trim()) return;
    const res = await fetch('/api/admin/media/thumbnail?url=' + encodeURIComponent(url.trim()));
    const { thumbnailUrl } = await res.json();
    if (thumbnailUrl) { setThumbPreview(thumbnailUrl); setThumbNeeded(false); }
    else setThumbNeeded(true);
  }

  // Image files are their own thumbnail; other file types need an uploaded thumbnail.
  function onPickFile(f: File | null) {
    setFile(f);
    setThumbPreview(null);
    setThumbNeeded(!!f && type !== 'image');
    if (f && type === 'image') setThumbPreview(URL.createObjectURL(f));
  }

  function reset() {
    setTitle(''); setDescription(''); setLinkUrl(''); setFile(null);
    setThumbPreview(null); setThumbNeeded(false); setThumbFile(null);
    if (fileRef.current) fileRef.current.value = '';
    if (thumbRef.current) thumbRef.current.value = '';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (source === 'file' && !file) return setError('Choose a file to upload.');
    if (source === 'link' && !linkUrl.trim()) return setError('Paste a link.');
    if (thumbNeeded && !thumbFile) return setError('A thumbnail is required — upload one.');
    setBusy(true);
    try {
      // 1. Resolve the main URL (Blob upload for files, the raw URL for links).
      let url = linkUrl.trim();
      let pathname: string | null = null;
      let size: number | null = null;
      const contentKind = source;
      if (source === 'file' && file) {
        const blob = await upload(`media/${Date.now()}-${file.name}`, file, {
          access: 'public', handleUploadUrl: '/api/admin/media/upload',
        });
        url = blob.url; pathname = blob.pathname; size = file.size;
      }
      // 2. Resolve the thumbnail URL.
      let thumbnailUrl: string | null = null;
      let thumbnailPathname: string | null = null;
      if (source === 'file' && type === 'image' && file) {
        thumbnailUrl = url; // the image itself
      } else if (thumbFile) {
        const t = await upload(`thumbnails/${Date.now()}-${thumbFile.name}`, thumbFile, {
          access: 'public', handleUploadUrl: '/api/admin/media/upload',
        });
        thumbnailUrl = t.url; thumbnailPathname = t.pathname;
      } else if (thumbPreview) {
        thumbnailUrl = thumbPreview; // auto-derived remote thumbnail
      }
      // 3. Save metadata.
      const res = await fetch('/api/admin/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type, description: description || null, contentKind, url, pathname, thumbnailUrl, thumbnailPathname, size }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed');
      reset();
      await loadRows();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: number, published: boolean) {
    await fetch(`/api/admin/media/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ published }) });
    loadRows();
  }
  async function remove(id: number) {
    if (!confirm('Delete this media item?')) return;
    await fetch(`/api/admin/media/${id}`, { method: 'DELETE' });
    loadRows();
  }

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_2fr]">
      {/* Add form */}
      <form onSubmit={submit} className="border border-stone bg-white p-6">
        <h2 className="font-heading text-xl text-ink">Add media</h2>
        {error && <p className="mt-3 border border-terracotta bg-cream px-3 py-2 text-sm text-terracotta">{error}</p>}
        <div className="mt-4 space-y-4">
          <div><label className={label}>Title</label><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
          <div>
            <label className={label}>Type</label>
            <select className={input} value={type} onChange={(e) => { setType(e.target.value as MediaRow['type']); onPickFile(file); }}>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div><label className={label}>Description</label><textarea className={input} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={source === 'file'} onChange={() => setSource('file')} className="accent-terracotta" /> Upload file</label>
            <label className="flex items-center gap-2"><input type="radio" checked={source === 'link'} onChange={() => setSource('link')} className="accent-terracotta" /> Paste link</label>
          </div>
          {source === 'file' ? (
            <div><label className={label}>File</label><input ref={fileRef} type="file" className={input} onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} /></div>
          ) : (
            <div><label className={label}>Link (YouTube, Vimeo, or any URL)</label><input className={input} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onBlur={(e) => resolveLinkThumb(e.target.value)} /></div>
          )}
          {thumbPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbPreview} alt="thumbnail preview" className="aspect-video w-full border border-stone object-cover" />
          )}
          {thumbNeeded && (
            <div>
              <label className={label}>Thumbnail required (no preview found)</label>
              <input ref={thumbRef} type="file" accept="image/*" className={input} onChange={(e) => { const f = e.target.files?.[0] ?? null; setThumbFile(f); if (f) setThumbPreview(URL.createObjectURL(f)); }} />
            </div>
          )}
          <button disabled={busy} className="w-full bg-ink px-6 py-3 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta disabled:opacity-50">
            {busy ? 'Saving…' : 'Add media'}
          </button>
        </div>
      </form>

      {/* Media list */}
      <div>
        {rows.length === 0 ? (
          <p className="text-sm text-ink2/70">No media yet. Add your first item on the left.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((m) => (
              <MediaCard key={m.id} item={m}>
                <div className="mt-3 flex items-center gap-3 border-t border-stone pt-3 text-xs">
                  <span className={m.published ? 'text-forest' : 'text-ink2/60'}>{m.published ? 'Visible' : 'Hidden'}</span>
                  <button onClick={() => toggle(m.id, !m.published)} className="uppercase tracking-[0.15em] text-ink2/70 hover:text-terracotta">{m.published ? 'Hide' : 'Show'}</button>
                  <button onClick={() => remove(m.id)} className="uppercase tracking-[0.15em] text-terracotta hover:underline">Delete</button>
                </div>
              </MediaCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/AdminMedia.tsx components/AdminDashboard.tsx
git commit -m "feat: add admin Media tab with upload/link + thumbnail form"
```

---

### Task 8: Practitioner `/resources` page + dashboard link

**Files:**
- Create: `app/resources/page.tsx`
- Create: `components/ResourcesApp.tsx`
- Modify: `components/DashboardApp.tsx` (add a "Browse resources" link next to the library button)

**Interfaces:**
- Consumes: `MediaCard` (Task 6); `GET /api/me` (401 pattern) and `GET /api/resources` (Task 5).
- Produces: `/resources` route rendering `ResourcesApp`.

- [ ] **Step 1: Create `app/resources/page.tsx`**

```tsx
import ResourcesApp from '@/components/ResourcesApp';

export const metadata = { title: 'Resources | Wild Nutrition Practitioner Community' };

export default function ResourcesPage() {
  return <ResourcesApp />;
}
```

- [ ] **Step 2: Create `components/ResourcesApp.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import MediaCard from '@/components/MediaCard';

interface MediaRow {
  id: number; title: string; type: 'video' | 'document' | 'slides' | 'image';
  description: string | null; url: string; thumbnailUrl: string | null;
}

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'video', label: 'Video' },
  { id: 'document', label: 'Documents' },
  { id: 'slides', label: 'Slides' },
  { id: 'image', label: 'Images' },
];

export default function ResourcesApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [filter, setFilter] = useState('');

  const load = useCallback(async (type: string) => {
    const res = await fetch('/api/resources' + (type ? `?type=${type}` : ''));
    if (res.status === 401) { setAuthed(false); return; }
    setAuthed(true);
    setRows((await res.json()).media);
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  if (authed === false) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="font-heading text-3xl text-ink">Please sign in</h1>
        <p className="mt-3 text-sm text-ink2/80">Resources are available to approved practitioners.</p>
        <a href="/dashboard" className="mt-6 inline-block bg-ink px-6 py-3 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta">Go to sign in</a>
      </div>
    );
  }

  return (
    <div className="w-full px-8 py-12 lg:px-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-heading text-3xl text-ink md:text-4xl">Resources</h1>
        <a href="/dashboard" className="text-xs uppercase tracking-[0.15em] text-terracotta underline">Back to dashboard</a>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-4 py-2 text-xs uppercase tracking-[0.15em] ${filter === f.id ? 'bg-ink text-cream' : 'border border-stone text-ink2/70 hover:border-terracotta'}`}>
            {f.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-ink2/70">No resources here yet.</p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((m) => <MediaCard key={m.id} item={m} />)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add a "Browse resources" link in `components/DashboardApp.tsx`**

Find the Learning/CPD card block (the `<a href="/library" ...>Open the learning library</a>`). Replace that single anchor with two side-by-side links:

```tsx
        <div className="flex flex-wrap gap-3">
          <a
            href="/library"
            className="bg-forest px-6 py-3 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta"
          >
            Open the learning library
          </a>
          <a
            href="/resources"
            className="border border-forest px-6 py-3 text-xs uppercase tracking-[0.2em] text-forest hover:border-terracotta hover:text-terracotta"
          >
            Browse resources
          </a>
        </div>
```

- [ ] **Step 4: Verify type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; `/resources` appears in the build route list.

- [ ] **Step 5: Commit**

```bash
git add app/resources/page.tsx components/ResourcesApp.tsx components/DashboardApp.tsx
git commit -m "feat: add practitioner resources page and dashboard link"
```

---

### Task 9: Admin full-width layout

**Files:**
- Modify: `app/admin/page.tsx`
- Modify: `components/AdminDashboard.tsx` (applications grid + table widths)

**Interfaces:** none (styling only).

- [ ] **Step 1: Widen the admin page shell**

In `app/admin/page.tsx`, change the wrapper `div` className from:
```tsx
    <div className="mx-auto max-w-6xl px-6 py-10">
```
to:
```tsx
    <div className="w-full px-8 py-10 lg:px-12">
```

- [ ] **Step 2: Let the applications panel use the full width**

In `components/AdminDashboard.tsx`, the applications panel currently uses `lg:grid-cols-[1.3fr_1fr]`. Widen the detail split so the table breathes on large screens — change:
```tsx
      <div className="mt-6 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
```
to:
```tsx
      <div className="mt-6 grid gap-8 xl:grid-cols-[2fr_1fr]">
```

(The table already has `w-full`; the wider page container from Step 1 gives it the space. Reporting/Lessons/AI/Media panels inherit the wider container automatically.)

- [ ] **Step 3: Verify visually with the preview**

Start the dev server and confirm the admin fills the page (see Task 10 for the preview workflow). Expected: content spans the viewport with even column spacing, no large right-hand gap.

- [ ] **Step 4: Commit**

```bash
git add app/admin/page.tsx components/AdminDashboard.tsx
git commit -m "feat: widen admin layout to full page width"
```

---

### Task 10: Blob store setup, full verification + deploy

**Files:** none (infrastructure + verification).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (existing + new media/thumbnail/resources tests).

- [ ] **Step 2: Create a Vercel Blob store + local token**

Run: `npx vercel blob store add wn-practitioner-media`
Expected: creates the store and prints/links a `BLOB_READ_WRITE_TOKEN`. Then pull it locally:

Run: `npx vercel env pull .env.local`
Expected: `.env.local` now contains `BLOB_READ_WRITE_TOKEN` (and other prod vars). Confirm `.env.local` is gitignored (it is by Next.js default).

If `vercel blob store add` is unavailable in this CLI version, create the store in the Vercel dashboard (Storage → Create → Blob) and connect it to the `practitioner-portal` project; the `BLOB_READ_WRITE_TOKEN` env var is added automatically.

- [ ] **Step 3: Local end-to-end check via the preview tools**

Create `.claude/launch.json` if absent with a `dev` config (`npm run dev`, port 3100). Start the server (preview_start), then:
- Log into `/admin` (password from `ADMIN_PASSWORD`), open the **Media** tab.
- Add a **link** item (a YouTube URL) → confirm the thumbnail auto-fills and the card appears.
- Add a **file** item (a small PDF) → confirm the "Thumbnail required" field appears, upload a thumbnail, save, and the card appears.
- Confirm **Hide** toggles visibility and **Delete** removes the card.
- Log into `/dashboard` as the approved practitioner (`utkarshrawatofficial@gmail.com`), click **Browse resources**, and confirm the published items show and filter by type; the hidden one is absent.

Capture a screenshot of the Media tab and the `/resources` grid.

- [ ] **Step 4: Deploy + set the Blob token in production**

The `BLOB_READ_WRITE_TOKEN` is set automatically when the Blob store is connected to the project. Confirm with:

Run: `npx vercel env ls production`
Expected: `BLOB_READ_WRITE_TOKEN` present. Then deploy:

Run: `npx vercel --prod --yes`
Expected: deployment READY, aliased to the rose URL.

- [ ] **Step 5: Production smoke test**

On `https://practitioner-portal-rose.vercel.app/admin`, add one link + one file media item, then verify they appear on `/resources` when signed in as the approved practitioner. Delete any throwaway test items afterward.

- [ ] **Step 6: Final commit (if any launch.json/docs changes)**

```bash
git add -A
git commit -m "chore: media feature verification config"
```

---

## Self-Review Notes

- **Spec coverage:** Part A (full-width admin) → Task 9. `media` table → Task 1. Blob client-upload → Tasks 3+7. Thumbnail derivation (YouTube/Vimeo/OG/image/upload) → Tasks 2+7. Admin API routes → Task 4. `/api/resources` → Task 5. Admin Media tab → Task 7. Practitioner `/resources` + dashboard link → Task 8. Shared identical card → Task 6. Immediate-publish + Hide/Delete → Tasks 4+7. Testing → Tasks 1,2,4,5. Setup steps → Task 10.
- **Type consistency:** `MediaRow`/`MediaCardItem` fields, `type` enum (`video|document|slides|image`), and `content_kind` (`file|link`) are used identically across db, routes, and components. `createMedia`'s object signature matches the POST route's mapping and the db test.
- **No live external calls in tests:** `@vercel/blob` `del` mocked (Task 4); thumbnail `fetch` stubbed (Task 2); Blob `upload()` only runs in the browser (Tasks 7/8 are verified via preview, not unit tests).
