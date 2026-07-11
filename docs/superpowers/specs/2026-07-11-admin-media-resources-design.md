# Admin Full-Width Layout + Media / Resources Feature — Design

_Date: 2026-07-11. Status: approved design, pre-implementation._

## 1. Goal

Two changes to the Wild Nutrition practitioner portal:

1. **Admin layout** — the `/admin` UI currently sits in a narrow centered `max-w-6xl` box,
   leaving large empty margins on wide screens. Make it fill the page and spread content
   evenly.
2. **Media / Resources** — add a new **Media** section to `/admin` where the team uploads
   materials (videos, docs, slides, images) *or* adds them by link, each with a thumbnail;
   and a new practitioner-facing **`/resources`** page where approved practitioners browse
   and open/download that media.

## 2. Part A — Admin full-width layout

Styling only, no logic changes.

- `app/admin/page.tsx`: replace the `mx-auto max-w-6xl px-6` wrapper with a full-width shell
  using horizontal padding only (e.g. `w-full px-8 lg:px-12 py-10`), so content uses the
  whole viewport with comfortable gutters.
- `components/AdminDashboard.tsx`: tables become `w-full` with evenly distributed columns
  (remove content-width shrink); the tab bar and panels stretch to the same width.
- Apply consistently to every panel — applications table, `AdminReporting`, `AdminLessons`,
  `AdminAiQueries`, and the new `AdminMedia` — so all tabs share the widened layout.
- No functional/data changes; existing tests unaffected.

## 3. Part B — Media / Resources feature

### 3.1 Storage — Vercel Blob, client-upload flow

Vercel serverless functions cap request bodies at ~4.5 MB, so files upload **directly from
the browser to Vercel Blob** using `@vercel/blob/client` (`upload()` + a server route that
returns a signed token via `handleUpload`). Large files and videos are supported. Only
metadata is written to the database.

- New dependency: `@vercel/blob`.
- New env var: `BLOB_READ_WRITE_TOKEN` (created by adding a Blob store to the Vercel project;
  set in Vercel production, and locally via `.env` for dev).
- All blobs (media files, admin-uploaded thumbnails) live in one store under a `media/`
  and `thumbnails/` path prefix.

### 3.2 Data model — new `media` table (Turso, in `lib/db.ts`)

| column | type | notes |
|---|---|---|
| `id` | integer PK | autoincrement |
| `title` | text | required |
| `type` | text | one of `video`, `document`, `slides`, `image` |
| `description` | text | optional |
| `content_kind` | text | `file` or `link` |
| `url` | text | Blob URL (file) or external URL (link) |
| `pathname` | text | Blob pathname for file deletion; null for links |
| `thumbnail_url` | text | Blob URL or auto-derived remote thumbnail URL |
| `thumbnail_pathname` | text | Blob pathname if the thumbnail was uploaded; else null |
| `size` | integer | bytes for files; null for links |
| `published` | integer | 1 = visible to practitioners, 0 = hidden. Default 1. |
| `created_at` | text | ISO timestamp |

Schema auto-creates on connection like the other tables. All db helpers async, matching the
existing libSQL pattern. Add: `createMedia`, `listMedia` (all, admin), `listPublishedMedia`
(practitioner), `getMedia`, `setMediaPublished`, `deleteMedia`.

### 3.3 Thumbnail derivation

Every card must have a thumbnail; files and links look identical. On the client, when a link
is pasted or a file is selected, the form resolves a thumbnail and shows a preview:

| Source | Thumbnail source |
|---|---|
| YouTube link | `https://img.youtube.com/vi/<id>/hqdefault.jpg` (parse video id) |
| Vimeo link | Vimeo oEmbed `thumbnail_url` (server route, avoids CORS) |
| Other web link | Best-effort Open Graph `og:image` (server route fetches + parses) |
| Uploaded image | The image itself (its own Blob URL) |
| Uploaded PDF / video / slides | No auto thumbnail → **admin must upload one** |

Rule: if auto-derivation returns nothing, a **"Thumbnail required"** image upload field
appears and the form cannot submit until a thumbnail is provided. Auto-fetch of link
thumbnails runs through a server route `GET /api/admin/media/thumbnail?url=...` that returns
`{ thumbnailUrl | null }` (handles YouTube id parsing, Vimeo oEmbed, and OG scraping;
1s–8s timeout; never throws).

### 3.4 API routes

Admin (all guarded by `isAuthed`, the existing admin cookie):
- `POST /api/admin/media/upload` — `handleUpload` token endpoint for direct Blob client uploads.
- `GET  /api/admin/media` — list all media (admin view).
- `POST /api/admin/media` — save metadata after a successful upload / link add.
- `GET  /api/admin/media/thumbnail?url=` — resolve an auto thumbnail for a link.
- `PATCH  /api/admin/media/[id]` — toggle `published` (Hide/Show).
- `DELETE /api/admin/media/[id]` — delete Blob file(s) + row.

Practitioner (guarded by the magic-link session, like `/api/me`):
- `GET /api/resources` — list published media for the grid.

### 3.5 Admin UI — `components/AdminMedia.tsx`, new "Media" tab

- Added as the 8th tab in `AdminDashboard` (`{ id: 'media', label: 'Media' }`); like
  `lessons`/`reporting` it loads its own data and just validates the session.
- **Add media form:** Title, Type (Video / PDF-Document / Slides / Image), Description,
  Source toggle (**Upload file** | **Paste link**), the file picker or URL input, and the
  conditional Thumbnail field (auto-preview, or required upload when auto fails).
  - Upload flow: file → `upload()` to Blob → on success `POST /api/admin/media` with metadata.
  - Link flow: URL → `GET thumbnail` → preview or prompt → `POST /api/admin/media`.
- **Media list:** the same card component used on `/resources` (thumbnail, title, type badge,
  size/kind, description) plus admin controls: **Hide/Show** and **Delete**.

### 3.6 Practitioner UI — `app/resources/page.tsx` + `components/ResourcesApp.tsx`

- Auth-gated with the practitioner magic-link session (reuse the `/api/me` 401 pattern from
  `DashboardApp`); unauthenticated users see the login prompt / are sent to `/dashboard`.
- Filterable grid of published media: filter chips by Type (All / Video / Document / Slides /
  Image); each **MediaCard** shows the thumbnail, title, type badge, description and an
  **Open / Download** action (links open in a new tab; files open their Blob URL).
- Linked from the dashboard next to "Open the learning library" (a "Browse resources" button).

### 3.7 Shared card component

`MediaCard` (used by both `AdminMedia` and `ResourcesApp`) guarantees files and links render
identically — thumbnail on top, then title, type badge, description, and the action. Admin
passes extra controls (Hide/Delete) as children/props; the practitioner view omits them.

### 3.8 Publish flow

Uploaded/added media is **published (visible) immediately**. Admin can **Hide** (sets
`published = 0`) or **Delete** at any time. No separate approval step (unlike Lessons), since
the uploader is the admin.

## 4. Testing

Follow the existing Vitest + `execForTests` pattern:
- `media` db helpers: create/list/listPublished/getMedia/setPublished/delete round-trips;
  `listPublishedMedia` excludes hidden rows.
- Thumbnail resolver: YouTube id parsing → correct URL; Vimeo/OG paths mocked via `fetch`
  stub; returns `null` (never throws) on failure.
- API routes: admin routes 401 without the cookie; `/api/resources` 401 without a session and
  returns only published rows with one.
- Type/enum validation on `POST /api/admin/media` (zod), mirroring `api-apply`/`api-admin`.

Blob `upload()`/`handleUpload` and network thumbnail fetches are mocked in tests (no live
Blob or external calls in the suite).

## 5. Out of scope (YAGNI)

- Draft/approval workflow for media (immediate publish instead).
- Per-practitioner access control / cohorts (all published media shown to all approved
  practitioners).
- Server-side thumbnail generation for video/PDF (admin uploads instead).
- Topic tagging / search beyond the Type filter (can be added later like Lessons tags).
- View/download analytics (can reuse the events pattern later if wanted).

## 6. One-time setup steps (implementation)

1. `npm install @vercel/blob`.
2. Create a Blob store on the Vercel project; set `BLOB_READ_WRITE_TOKEN` in Vercel production
   (and local `.env` for dev).
3. Deploy; verify an end-to-end upload + a link add + a practitioner view.
