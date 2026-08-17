# Cloudflare Migration — Design Spec

**Date:** 2026-08-17
**Branch:** `cloudflare-migration`
**Target repo:** `utkarshrawat123/Practitioner_portal` (work account)
**Status:** Design — awaiting user review

---

## 1. Goal

Re-platform the Practitioner Portal from **Turso + Vercel Blob + Vercel hosting**
onto **Cloudflare infrastructure (D1 + R2 + Workers)**, so that the moment company
Cloudflare keys/access arrive it can be deployed and made live with a short,
copy-paste checklist — no further code work.

## 2. Hard constraints

1. **No harm to the live portfolio.** The personal repo (`Utkarshraw123`) `main`
   branch — running on Turso + Vercel — must never be touched. All work lands on
   the `cloudflare-migration` branch and is pushed only to the **work** repo
   (`utkarshrawat123`).
2. **No company infra access required to build.** The entire port must be
   buildable and testable **offline** using Wrangler's local emulators
   (Miniflare: local D1, local R2, local Workers). Real Cloudflare account +
   tokens are needed only for the final production deploy.
3. **Existing test suite stays green** (358 tests via Vitest as of implementation),
   running against a local file-based libSQL database exactly as today.

> **Implementation corrections (2026-08-17):**
> - Cloudflare's current OpenNext adapter requires **Next.js 15+**, so the app was
>   upgraded 14 → 15 (async `cookies()`/`params`) as a prerequisite.
> - **Email is load-bearing, not "no change":** production ran on Gmail **SMTP**
>   (`nodemailer`), which cannot run on Workers. `nodemailer` is now lazy-loaded so
>   it never bundles into the Worker, and **Resend** (already `fetch`-based) is the
>   Cloudflare sender — set `RESEND_API_KEY` + `EMAIL_FROM` at go-live.
> - The AI features run on **Google Gemini** via `fetch` (already Workers-safe);
>   secrets include `GEMINI_API_KEY`/`GEMINI_API_KEY2`.
> - The AI knowledge base (`knowledge/*.md`) is now bundled at build time
>   (`npm run bundle-kb`) so it loads on Workers without a filesystem.

## 3. Guiding principle — "mock until keyed"

The codebase already uses a *"leave blank → run in mock mode"* convention
(Shopify, Mailchimp, email). We extend the same idea to every Cloudflare
integration. Each integration selects its implementation at runtime by what is
present:

| Integration | If present → live | Else → fallback |
|---|---|---|
| Database | D1 binding (`env.DB`) | libSQL file (local dev/tests) — **unchanged** |
| Storage | R2 binding (`env.BUCKET`) | Local/mock storage adapter |
| Email | `RESEND_API_KEY` | Mock email (logs only) — **already exists** |

Result: the app runs fully end-to-end **with zero secrets** for continued
development, and goes live automatically when bindings/keys are added. Nothing is
rewritten on go-live day.

## 4. Target architecture — component mapping

| Concern | Today | Cloudflare target | Size of change |
|---|---|---|---|
| Hosting/runtime | Next.js on Vercel | Next.js on **Cloudflare Workers** via **`@opennextjs/cloudflare`** (OpenNext) | New adapter + `wrangler.toml` |
| Database | `@libsql/client` → Turso | **D1** via a libSQL-shaped adapter behind `getClient()` | **1 file** (`lib/db.ts`) + adapter |
| Migrations | `lib/migrations.ts` runs SQL on boot | Same SQL, applied via `wrangler d1 migrations` | Port trigger, keep SQL |
| File storage | `@vercel/blob` (5 call sites) | **R2** via new `lib/storage` abstraction | 5 call sites → 1 abstraction |
| Email (transactional) | Resend (`fetch`) / Gmail SMTP | **Resend** (already `fetch`-based ✓); SMTP disabled on Workers | Minimal |
| Scheduled jobs | Vercel cron in `vercel.json` (3 jobs) | **Cloudflare Cron Triggers** → Worker `scheduled()` handler | Config + thin handler |
| AI assistant | `@anthropic-ai/sdk` | Works on Workers over `fetch` | Verify only |

> **Why OpenNext (`@opennextjs/cloudflare`) and not `@cloudflare/next-on-pages`:**
> we need D1/R2 bindings **and** cron. OpenNext targets Workers and supports
> bindings + a `scheduled()` handler for cron; the older next-on-pages targets
> Pages, which has no cron. OpenNext is the current recommended path.

## 5. Detailed design per layer

### 5.1 Hosting / build (OpenNext + Wrangler)

- Add dev deps: `@opennextjs/cloudflare`, `wrangler`.
- Add `wrangler.toml` (or `wrangler.jsonc`) declaring:
  - `compatibility_flags = ["nodejs_compat"]` (for `Buffer`, `crypto`, etc.)
  - `[[d1_databases]]` binding `DB` (placeholder `database_id`)
  - `[[r2_buckets]]` binding `BUCKET` (placeholder bucket name)
  - `[triggers] crons = [...]` — the two/three schedules
  - `[vars]` / secrets list (see §6)
- Add npm scripts: `preview` (`opennextjs-cloudflare build && wrangler dev`),
  `deploy:cf` (`opennextjs-cloudflare build && wrangler deploy`), and a local
  D1/R2 dev flow.
- `next.config.mjs`: add the OpenNext dev-bindings hook; keep the current Vercel
  config intact so `npm run dev`/Vercel still work on `main` (no regression).

### 5.2 Database → D1

- Introduce `lib/db/d1-adapter.ts`: a tiny object implementing the **subset** of
  the libSQL `Client` interface actually used — `execute({ sql, args })`,
  `batch(...)`, and (if used) `transaction()` — mapped onto D1's
  `prepare().bind().all()/run()`. Return shape normalized to `{ rows, ... }` so
  `db.ts` query helpers are untouched.
- Modify only `getClient()` in `lib/db.ts` to choose:
  1. D1 adapter when a D1 binding is available (via
     `getCloudflareContext().env.DB` from OpenNext),
  2. else libSQL `TURSO_DATABASE_URL` (web) if set,
  3. else libSQL `file:` (local dev + tests) — **current behaviour, unchanged**.
- **SQL portability check:** D1 and libSQL are both SQLite. Audit
  `lib/migrations.ts` for any libSQL-only syntax; expected to port as-is, but this
  is an explicit verification task.
- Migrations on D1 are applied out-of-band (`wrangler d1 migrations apply`) rather
  than on first request; the boot-time `runMigrations()` remains for local/file
  mode.

### 5.3 File storage → R2

- New `lib/storage/index.ts` exposing `put`, `get`, `delete`, `publicUrl` with two
  implementations:
  - **R2**: `env.BUCKET.put/get/delete`. **Certificates** served via a gated
    `/api/files/[...key]` route (auth-checked); **media** via a public bucket
    (see §11).
  - **Local/mock**: writes under `data/uploads` (dev) so uploads work offline.
- Replace the 5 `@vercel/blob` call sites
  (`lib/certificates.ts`, `app/api/admin/media/upload`, `.../media/[id]`,
  `.../media/cleanup`, `app/api/certification`) with the abstraction.
- DB stores the object **key + public URL** (columns already exist:
  `pathname`, `url`, `thumbnailPathname`, `thumbnailUrl`).

### 5.4 Email

- Keep the existing provider abstraction. `getEmailProvider()` already prefers
  **Resend** (`fetch`, Workers-safe) → mock. No functional change needed.
- Ensure `nodemailer`/`lib/providers/smtp.ts` is **not bundled into the Worker**
  (guard its import / mark external) since it can't run on Workers. SMTP stays
  available for local Node only.
- Go-live = set `RESEND_API_KEY` + verified sender domain.

### 5.5 Scheduled jobs → Cron Triggers

- The 3 existing endpoints stay: `/api/cron/run`, `/api/cron/chat-alerts`,
  `/api/cron/heartbeat`.
- Add a Worker `scheduled(event)` handler (via OpenNext) that dispatches to the
  relevant job logic based on `event.cron`. Schedules declared in `wrangler.toml`
  mirror today's `vercel.json` (`0 6 * * *` run, `0 7 * * *` chat-alerts).
- Protect the HTTP cron routes with a shared secret header (as today) so they
  can't be triggered publicly.

### 5.6 AI assistant

- `@anthropic-ai/sdk` runs on Workers via `fetch`. Verify `lib/ai/factory.ts`
  uses no Node-only APIs; add `ANTHROPIC_API_KEY` to the secrets list. Stays in
  its existing mock/degraded mode when the key is absent.

### 5.7 Runtime compatibility sweep

- `nodejs_compat` covers `Buffer`, `node:crypto` (`randomBytes`, `createHash`).
- Guard `fs`/`path` usage in `lib/db.ts` so it only runs in `file:` mode (never on
  Workers).
- Grep for other Node-only usages (`fs`, `process.cwd`, `Buffer`, `path`,
  streams) across `lib`/`app` and resolve each — enumerated as plan tasks.

## 6. Configuration & secrets

`wrangler.toml` bindings (placeholders committed, real IDs added on go-live):
- `DB` → D1 database id
- `BUCKET` → R2 bucket name
- Secrets (via `wrangler secret put` or dashboard):
  `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`, `SESSION_SECRET`,
  `CRON_SECRET`, `PORTAL_URL`, `COMMISSION_PERCENT`.
- **Not needed on Cloudflare:** `TURSO_*`, `BLOB_READ_WRITE_TOKEN`, `VERCEL_*`,
  `GMAIL_*` (replaced by D1 / R2 / Resend).

## 7. Local development & testing (no account needed)

- **Vitest suite:** keeps running against local `file:` libSQL — untouched, must
  stay green throughout.
- **Cloudflare local run:** `wrangler dev` with `--local` D1 + R2 emulation to
  exercise the real bindings offline. A local D1 is seeded from the same
  migration SQL.
- Add a short `docs/CLOUDFLARE_DEV.md` for the local emulator workflow.

## 8. GO-LIVE checklist (when company access arrives)

Delivered as `docs/CLOUDFLARE_GO_LIVE.md`:
1. Create Cloudflare resources (dashboard): D1 database, R2 bucket.
2. Paste their IDs into `wrangler.toml`.
3. `wrangler d1 migrations apply <db>` to create the schema.
4. `wrangler secret put` for each secret in §6.
5. Verify Resend sender domain; set `RESEND_API_KEY`.
6. Connect the work repo to Cloudflare (Pages/Workers CI) **or**
   `npm run deploy:cf`.
7. Smoke-test: apply flow, admin login, media upload (R2), a cron dry-run.

## 9. Repo / branch strategy

- All work on `cloudflare-migration`, pushed to **work** repo only.
- Personal repo `main` (Turso/Vercel live portfolio) untouched.
- Work repo can later fast-forward its own `main` to this branch when ready.

## 10. Testing strategy for the port

- Adapter unit tests: D1 adapter returns the same normalized shape as libSQL for
  representative queries.
- Storage abstraction tests: put/get/delete round-trip against the local
  implementation.
- Full existing suite green on every step (TDD; change one layer at a time).
- Manual: `wrangler dev` local smoke test of upload + DB read/write.

## 11. Confirmed decisions

1. **R2 object serving — DECIDED:** **Certificates** (sensitive) are served through
   a **login-gated `/api/files/[...key]` route** that checks auth before streaming
   the R2 object. **Marketing media** goes in a **public R2 bucket** with direct
   public URLs.
2. **Deploy trigger — DECIDED:** **Git-connected Cloudflare CI** — auto-deploy on
   push to the work repo. Fully browser-based, so the locked-down office laptop can
   ship without installing anything.
3. **Data — DECIDED:** Work copy starts with an **empty D1** (schema only, no data
   copy). A data-copy step is explicitly out of scope for now.

## 12. Out of scope (YAGNI)

- Migrating existing Turso **data** into D1 (work copy starts fresh; a data-copy
  step can be added later if wanted).
- Changing any application features or UI.
- Touching the live Vercel deployment or personal repo.
- Replacing Anthropic/Resend with other vendors.
