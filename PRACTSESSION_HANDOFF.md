# PRACTSESSION_HANDOFF.md

**Wild Nutrition Practitioner Hub — session handoff.** Written 2026-07-15.
Repo: `/Users/utkarshrawat/Wild Dash/practitioner-portal` · Branch `main` · HEAD `f35dc2f`.
Live: https://practitioner-portal-rose.vercel.app · Latest prod deploy `i1y0p62vi`.

This session did two things: (a) a batch of fixes/features on the existing app, then (b)
**Part 1** of the 7-part "Practitioner Hub" build plan (integrations + data foundations).
This file is the authoritative state. See also `CLAUDE.md` (agent guide) and
`PROJECT_HANDOFF.md` (older narrative history).

---

## PART 3 — Learning Pathways & CPD (2026-07-16, merged to main + DEPLOYED to prod)

Branch `part-3-pathways` → merged to `main` → deployed (rose alias). **210 tests pass, build clean.**
Also this session: Part 2 Welcome recolored navy → brand forest-green (`components/WelcomeExperience.tsx`).
Spec `docs/superpowers/specs/2026-07-16-part-3-pathways-design.md`.

- **Migration 009**: `pathways.category` + `pathways.cpd_hours`; new `module_completions` table.
- **DB helpers** (`lib/db.ts`): pathways/modules CRUD, `pathwayProgress`/`allPathwayProgress`
  (module complete = explicit `module_completions` row OR its lesson is in `lesson_completions`;
  progress = required-and-complete ÷ required), certificates (`getCertificate/listCertificates/issueCertificate`).
- **Certificate service** `lib/certificates.ts`: `generateCertificatePdf` (pdf-lib, A5, brand colours)
  + `maybeIssueCertificate` (issues once on 100% required, uploads PDF to Vercel Blob, idempotent).
- **Practitioner**: `/learning` (catalogue by 8 categories), `/learning/[id]` (modules, progress,
  mark-complete, cert download), `/cpd` (certs + progress). APIs `app/api/me/pathways{,/[id],/[id]/complete}`,
  `app/api/me/cpd`. Homepage **Continue Learning** now reads real pathway progress; **My CPD** Quick Link → `/cpd`.
- **Admin**: 10th tab **Pathways** (`components/AdminPathways.tsx`) — create pathway (title/category/cpd_hours/
  audience/publish), add/reorder/require/remove modules from published lessons+media. APIs
  `app/api/admin/pathways{,/[id],/[id]/modules,/[id]/modules/[moduleId],/content}`.
- **Dep added**: `pdf-lib`.
- **Verified end-to-end** (local isolated DB + real Blob token): admin build → catalogue → detail →
  complete both modules → certificate issued (real PDF at blob.vercel-storage.com, 200/application/pdf) → /cpd.
  NOTE: that local verify uploaded one test cert `certificates/1-1-*.pdf` to the PROD Blob store (harmless orphan).
- Migration 009 runs on first prod DB touch (adds columns + table). No new env vars.

---

## PART 2 — Homepage, Welcome onboarding & nav (2026-07-15, branch `part-2-homepage`, merged + deployed)

Built on branch `part-2-homepage` (off `main` @ `f35dc2f`). **197 tests pass, `npm run build` clean.**
Spec: `docs/superpowers/specs/2026-07-15-part-2-homepage-onboarding-design.md`;
plan: `docs/superpowers/plans/2026-07-15-part-2-homepage-onboarding.md`.

**What shipped (all TDD/verified):**
- **Migration `008_has_seen_welcome`** — adds `practitioners.has_seen_welcome` and **backfills existing
  rows to 1** (so the 4 live accounts are NOT shown the takeover; only new sign-ups see it). `markSeenWelcome`.
- **Cinematic Welcome** at `/onboarding/welcome` (`components/WelcomeExperience.tsx`, framer-motion +
  lucide-react + Fraunces/Inter via `next/font/google`). 2 scenes, deep-navy palette, SVG grain, word
  pull-ups + char-by-char scroll reveal, "Start Exploring" CTA → POST `/api/me/seen-welcome` → `/dashboard`.
  Gated: `app/dashboard/page.tsx` is now a server shell that redirects first-timers to the Welcome.
- **Context-aware header** (`components/SiteHeader.tsx`, server) — practitioner nav (Home/Learning/Clinical
  Toolkit/Community/Events + Log out) when signed in, Apply/Sign in otherwise. `lib/serverSession.ts`
  `getServerSessionPractitioner()`. `components/ChromeGate.tsx` hides header/footer on `/onboarding/*`.
- **Redesigned homepage** (`components/DashboardApp.tsx`) — time-based greeting, Continue Learning (lessons
  stub → Part 3 swaps to pathway progress), **What's New** feed from `GET /api/me/widgets` (audience-filtered
  via `hasAccess`), Quick Links grid (Ask Lorna→`/assistant`; unbuilt→coming-soon), compact **Your referrals**
  card (code/link/stats retained), slim tier line.
- **Admin "Homepage" tab** (`components/AdminWidgets.tsx`, 9th tab) — create/edit/reorder/hide/delete What's
  New cards. APIs `app/api/admin/widgets{,/[id]}`. DB helpers `createHomepageWidget/listHomepageWidgets/
  listPublishedWidgetsFor/updateHomepageWidget/deleteHomepageWidget` in `lib/db.ts` (widget image = URL field
  MVP; Blob-upload UI deferred). `homepage_widgets` table is from Part 1.
- **Coming-soon stubs** `/learning /toolkit /community /events /coming-soon` (`components/ComingSoon.tsx`);
  Parts 3–5 replace the bodies.
- **Deps added:** `framer-motion@^11`, `lucide-react@^0.400.0`.

**Browser-verified** against an isolated LOCAL file DB (never touched prod Turso): public header, first-login
Welcome gate, Welcome scenes + CTA flag persistence, homepage + audience-filtered What's New (student-only
widget correctly hidden from a qualified practitioner), coming-soon route, admin Homepage tab, and mobile 375px.

**TO DEPLOY (user decision — not auto-merged):** merge `part-2-homepage` → `main`, then `npx vercel --prod --yes`.
Migration 008 runs on first connection to prod Turso (adds the column + backfills the 4 live rows to `has_seen_welcome=1`).
No new env vars required. **Order matters** (per plan's branching rule): don't start Part 3 until this merges.

---

## 1. Part 1 acceptance checklist — item by item

| # | Acceptance item | Status | Where |
|---|---|---|---|
| 1 | Real Shopify order → real revenue in Dashboard + Reporting within minutes | **PARTIAL — plumbing done, needs creds** | webhook `app/api/webhooks/shopify/route.ts`; `orders` helpers in `lib/db.ts`; read path `lib/stats.ts` + `lib/reporting/signals.ts` |
| 2 | `/assistant` returns a real grounded recommendation (not "not configured") | **PARTIAL — wiring verified, needs `ANTHROPIC_API_KEY`** | `lib/ai/assistant.ts:134 isConfigured()` reads `ANTHROPIC_API_KEY`; gated in `app/api/assistant/route.ts:22` |
| 3 | `npm run generate-lessons` produces real draft lessons via Claude | **PARTIAL — wiring verified, needs `ANTHROPIC_API_KEY`** | `scripts/generate-lessons.ts:77` checks `isConfigured()` |
| 4 | New tables exist and migrate cleanly with no data loss | **DONE + verified on live Turso** | `lib/migrations.ts`; wired in `lib/db.ts` `getClient()` |
| 5 | A test cron endpoint fires successfully on schedule | **DONE** (endpoint verified live; schedule registered) | `app/api/cron/heartbeat/route.ts`; `vercel.json` `crons` |

**Extra deliverables this Part (not on the checklist but in the kickoff prompt):**
- `hasAccess(practitioner, resource)` qualified/student gate — `lib/access.ts`.
- `CLAUDE.md` agent guide written at repo root.

**Verification performed:** `schema_migrations` on live Turso holds all 7 ids
(`001_orders`…`007_homepage_widgets`); all 10 new tables present; existing tables intact.
Cron: 401 without secret / 200 + `firedAt` with `Authorization: Bearer $CRON_SECRET`.
Webhook: 401 on unsigned POST. Full test suite **183 passing**; `npm run build` clean.

### Files created/modified in Part 1
- **New:** `lib/migrations.ts`, `lib/access.ts`, `app/api/webhooks/shopify/route.ts`,
  `app/api/cron/heartbeat/route.ts`, `CLAUDE.md`,
  tests: `tests/migrations.test.ts`, `tests/orders-db.test.ts`, `tests/access.test.ts`,
  `tests/api-webhooks-shopify.test.ts`, `tests/api-cron-heartbeat.test.ts`.
- **Modified:** `lib/db.ts` (import+run migrations in `getClient`; added `OrderInput`,
  `recordOrder`, `orderStatsByCode`, `referralDataByCode`), `lib/stats.ts` (added `localStats`
  provider; `getStatsProvider` now defaults to local), `lib/reporting/signals.ts` (added
  `localProvider`; `getReferralDataProvider` defaults to local), `vercel.json` (crons),
  `tests/stats.test.ts` (provider default assertion mock→local).

### Earlier this session (pre-Part-1), all deployed
- Dashboard **stat cards always visible** (zeros) with empty-state hint — `components/DashboardApp.tsx`.
- **Auto-login on approval** — `app/api/apply/route.ts` sets `wn_session` on approval.
- **Centered layout** (admin + /resources at `max-w-7xl`; applications table fills width when no row selected) — `app/admin/page.tsx`, `components/AdminDashboard.tsx`, `components/ResourcesApp.tsx`, `app/layout.tsx`.
- **Infra fixes:** removed `/tmp` DB fallback (throws instead) and added `cache:'no-store'` to the libSQL fetch — both in `lib/db.ts`. These fixed a real stale-admin-data bug.
- **Orphaned-Blob cleanup** — `app/api/admin/media/cleanup/route.ts` + `components/AdminMedia.tsx`.
- Earlier still: Gmail SMTP email, media/resources feature, Turso persistence (see `PROJECT_HANDOFF.md`).

---

## 2. Decisions made that weren't explicitly specified

1. **`hub_events` / `hub_event_registrations`** instead of `events`/`event_registrations` — the
   name `events` is already the practitioner **audit-trail** table (`practitioner_id, type,
   detail`). Reusing it would have been catastrophic. A test asserts the audit table is untouched.
2. **Versioned migration runner** (`schema_migrations` + ordered idempotent `MIGRATIONS[]`) —
   not requested by name, but added because the base `SCHEMA` uses `CREATE TABLE IF NOT EXISTS`,
   which **cannot add a column to an existing table**; later Parts need safe evolution. Rule:
   append a new migration id, never edit/reorder a shipped one.
3. **Revenue mechanism = webhook + local `orders` table** (chosen over the pre-existing live
   Admin-API query). Both `lib/stats.ts` and `lib/reporting/signals.ts` now **default to the
   local table**; the live Admin-API providers are kept but only used when
   `STATS_SOURCE=shopify-live`. This was surfaced as a decision; user approved building the webhook path.
4. **`hasAccess` semantics = exact match, not a hierarchy.** `audience='qualified'` is hidden
   from students AND `audience='student'` is hidden from qualified HCPs; `'all'` (the column
   default) is everyone. Chosen for predictability; easy to change to "qualified sees all" later.
5. **Every content table has an `audience TEXT DEFAULT 'all'` column** (pathways,
   toolkit_resources, hub_events, homepage_widgets) so one `hasAccess` call gates everything.
6. **`toolkit_resources.content_kind` supports `file|link|text`** — `text` stores inline `body`
   (for FAQs / email templates); `file`/`link` use `url` (+`pathname` for Blob files). Inferred
   from the Part 4 content-type list.
7. **`orders` idempotency** keyed on Shopify `order_id` (UNIQUE) via `INSERT … ON CONFLICT DO
   UPDATE`, so replayed webhooks don't double-count.
8. **Webhook maps by discount code → practitioner** using the existing `findByCode()` and the
   first matching `discount_codes[].code`; unmatched orders are acknowledged 200 `matched:false`
   (so Shopify doesn't retry) and **not** stored.
9. **Cron schedule = daily 06:00 UTC** (`0 6 * * *`) — a safe default that works on Vercel Hobby
   (daily-only). Guarded by `CRON_SECRET` Bearer check.
10. **`community_posts` / `community_replies` deferred to Part 5** (native-vs-Facebook decision
    is a Part 5 choice) — user approved deferring.
11. **`STATS_SOURCE` env flag** invented to switch stats source (`local` default /
    `shopify-live` / `mock`) and to keep the Shopify providers referenced (no dead code).
12. **`pathway_modules.content_kind` = `lesson|media`** with a bare `content_id` (no FK, since it
    can point at either `lessons` or `media`).

---

## 3. Stack — real vs your original assumptions

Your assumptions were **correct except one**. Verified against `package.json` + source:

| Assumed | Reality |
|---|---|
| Next.js (App Router) on Vercel | ✅ `next ^14.2.5`; `vercel.json` framework nextjs |
| Turso (libSQL) — "raw SQL or Drizzle" | ✅ Turso, **but RAW parameterized SQL via `@libsql/client ^0.17.4` — NO ORM** (no Drizzle/Prisma). Tables live in a `SCHEMA` string + `lib/migrations.ts`; helpers are hand-written `one/all/run`. **Any "add a Drizzle migration" instruction must become "add a migration to `lib/migrations.ts` + async helpers in `lib/db.ts`."** |
| HMAC session cookie + magic-link, no password | ✅ `lib/practitionerAuth.ts` (`wn_session`, HMAC-SHA256, `timingSafeEqual`); admin side DOES use a password → `wn_admin` cookie |
| Gmail SMTP via nodemailer | ✅ `nodemailer ^9.0.3`, `lib/providers/smtp.ts` (`service:'gmail'`). A dormant Resend provider exists as an upgrade path |
| Vercel Blob | ✅ `@vercel/blob ^2.6.1`, `handleUpload` client-upload flow |
| Tailwind | ✅ `tailwindcss ^3.4.6` |
| Anthropic Messages API, RAG vs `knowledge/` | ✅ `@anthropic-ai/sdk ^0.110.0`; `lib/ai/assistant.ts` `client.messages.create`, `MODEL='claude-opus-4-8'`; `lib/ai/kb.ts` loads `knowledge/` (`KB_DIR` overridable) |

Also: validation is **zod**; tests are **Vitest** (TDD) with a `DB_PATH` temp-file +
`resetDbForTests()` harness; `execForTests()` is the raw-SQL test escape hatch.

---

## 4. Exact current DB schema (live Turso, authoritative)

Pulled from `sqlite_master` on the live DB. **21 tables** (9 original + `media` + 10 Part-1 +
`schema_migrations`) + 5 indexes.

**Original / pre-Part-1 tables:**
- `practitioners(id, name, email UNIQUE, register_body, register_number, qualification_status,
  tier DEFAULT 'standard', status DEFAULT 'pending', verification_json, affiliate_code UNIQUE,
  affiliate_link, pending_sync, created_at, decided_at, decided_by)` — `qualification_status` is
  `'qualified'|'student'` (the gating field); `status` is `pending|approved|flagged|rejected`.
- `events(id, practitioner_id→practitioners, type, detail, created_at)` — **audit trail** (NOT the events hub).
- `auth_tokens(token PK, practitioner_id→practitioners, expires_at, used_at)` — magic-link tokens.
- `clicks(id, practitioner_id→practitioners, code, created_at)` — referral clicks.
- `ai_queries(id, practitioner_id→practitioners, profile_input, status, safety_flags, output_json, grounding_warnings, model, input_tokens, output_tokens, created_at)`.
- `lessons(id, source_file, title, summary, takeaways_json, quiz_json, topics_json, claim_flags_json, status DEFAULT 'draft', model, input_tokens, output_tokens, created_at, decided_at)`.
- `lesson_completions(id, practitioner_id→practitioners, lesson_id→lessons, completed_at, UNIQUE(practitioner_id,lesson_id))`.
- `login_events(id, practitioner_id→practitioners, created_at)`.
- `media(id, title, type, description, content_kind, url, pathname, thumbnail_url, thumbnail_pathname, size, published DEFAULT 1, created_at)` — `type`∈video/document/slides/image, `content_kind`∈file/link.

**Part-1 tables (new this session):**
- `orders(id, order_id TEXT UNIQUE, practitioner_id→practitioners NULLABLE, code, total REAL, currency DEFAULT 'GBP', financial_status, created_at, received_at)` — indexes on `code`, `practitioner_id`.
- `pathways(id, title, description, audience DEFAULT 'all', published DEFAULT 0, created_at)`.
- `pathway_modules(id, pathway_id→pathways, title, content_kind, content_id, position, required DEFAULT 1)` — index on `pathway_id`. `content_kind`∈lesson/media, `content_id` = lessons.id or media.id (no FK).
- `certificates(id, practitioner_id→practitioners, pathway_id→pathways, issued_at, pdf_url, UNIQUE(practitioner_id,pathway_id))`.
- `toolkit_resources(id, title, type, description, audience DEFAULT 'all', content_kind, url, body, pathname, thumbnail_url, published DEFAULT 1, created_at)` — `type`∈handout/protocol/decision_tree/recipe/faq/email_template, `content_kind`∈file/link/text.
- `hub_events(id, title, description, starts_at, ends_at, location, audience DEFAULT 'all', recording_url, published DEFAULT 1, created_at)`.
- `hub_event_registrations(id, event_id→hub_events, practitioner_id→practitioners, registered_at, UNIQUE(event_id,practitioner_id))` — index on `event_id`.
- `tier_history(id, practitioner_id→practitioners, tier, computed_at)` — index on `practitioner_id`.
- `leaderboard_optins(practitioner_id PK→practitioners, opted_in DEFAULT 0, display_name, updated_at)`.
- `homepage_widgets(id, title, body, link_url, image_url, audience DEFAULT 'all', position DEFAULT 0, published DEFAULT 1, created_at)`.
- `schema_migrations(id PK, applied_at)` — holds `001_orders`…`007_homepage_widgets`.

> **FK note:** Turso **enforces foreign keys** (unlike bare SQLite). `orders.practitioner_id` is
> nullable, but the webhook only writes it with a real practitioner id. To re-dump the schema:
> `SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'`.

---

## 5. Environment variables in use (no secret values)

**Set in Vercel production (10):**
| Var | Purpose |
|---|---|
| `TURSO_DATABASE_URL` | libSQL/Turso database URL (`libsql://utkarsh-utkarshraw123.aws-eu-west-1.turso.io`) — required; app throws on serverless if missing |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `ADMIN_PASSWORD` | `/admin` login (currently `wild-admin-2026`) |
| `SESSION_SECRET` | HMAC key for `wn_session` practitioner cookies |
| `PORTAL_URL` | Base URL for referral + magic links (the rose URL) |
| `COMMISSION_PERCENT` | Commission calc (20) |
| `GMAIL_USER` | Gmail SMTP sender (`utkarshrawatofficial@gmail.com`) |
| `GMAIL_APP_PASSWORD` | Gmail app password for SMTP |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store token (media uploads) — auto-added by the linked Blob store |
| `CRON_SECRET` | Bearer secret Vercel Cron sends to `/api/cron/heartbeat` (set this session; value in scratchpad `cron_secret.txt`, ephemeral) |

**Read by code but NOT set (features stay mock/off until added):**
| Var | Effect when set |
|---|---|
| `ANTHROPIC_API_KEY` | flips `/assistant` + `generate-lessons` live |
| `SHOPIFY_STORE_DOMAIN` | Shopify Admin API domain (e.g. `x.myshopify.com`) |
| `SHOPIFY_ADMIN_TOKEN` | Shopify Admin API access token (creates discount codes; live-query providers) |
| `SHOPIFY_WEBHOOK_SECRET` | **required** for the webhook HMAC check to pass |
| `AFFILIATE_DISCOUNT_PERCENT` | % for auto-created Shopify discount codes (default 10) |
| `STATS_SOURCE` | `shopify-live` = query Admin API directly; `mock` = force zeros; unset/other = local orders table (default) |
| `EMAIL_FROM` | overrides the From header (SMTP/Resend) |
| `RESEND_API_KEY` | activates the dormant Resend email provider (currently unused) |
| `DB_PATH` | local/test only — libSQL `file:` path (tests set this per-run) |
| `KB_DIR` | overrides the AI knowledge-base dir (default `knowledge/`) |
| `MAILCHIMP_API_KEY` / `MAILCHIMP_AUDIENCE_ID` | legacy marketing path — not needed (Gmail SMTP covers transactional) |

---

## 6. Left broken / stubbed / partial — and what finishes it

1. **Shopify revenue (PARTIAL).** All code is live but no store is connected, so revenue is £0.
   **To finish:** set `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`,
   (opt) `AFFILIATE_DISCOUNT_PERCENT` in Vercel; in Shopify admin **register two webhooks**
   (`orders/create`, `orders/paid`) → `https://practitioner-portal-rose.vercel.app/api/webhooks/shopify`
   with the same signing secret. Then a real order carrying a `WN-…` discount code appears in
   `orders` and lights up the dashboard/reporting. Discount codes are auto-created on practitioner
   approval **only when** `SHOPIFY_ADMIN_TOKEN` is set (`lib/providers/affiliates.ts`); existing
   approved practitioners won't have Shopify codes until re-synced (admin "retry-sync").
2. **AI features (PARTIAL).** `/assistant` returns 503 `not_configured`; `generate-lessons` exits
   early. **To finish:** set `ANTHROPIC_API_KEY` in Vercel (+ `.env.local` for the offline script),
   then run one `/assistant` query and `npm run generate-lessons`. KB in `knowledge/` is still
   **SAMPLE placeholder content** — replace before real clinical use.
3. **Cron does nothing yet.** `/api/cron/heartbeat` only logs a timestamp — intentional skeleton.
   Part 6 adds real jobs (tier recalculation, lifecycle emails). Vercel fires it daily 06:00 UTC.
4. **Part-1 tables are empty scaffolding.** `pathways`, `toolkit_resources`, `hub_events`,
   `homepage_widgets`, etc. exist but have **no CRUD routes, admin UI, or helper functions yet** —
   those come in Parts 2–6. `hasAccess` is ready for them to call.
5. **Reporting `computeTier` vs `tier_history`/`leaderboard_optins`.** Reporting still computes
   tier as a live read-model; `tier_history` + `leaderboard_optins` tables exist but are unused
   until Part 6 wires the scheduled recalculation + leaderboard.

---

## 7. Test data / sandbox / manual steps to redo

- **Live Turso practitioners right now (id, name, email, status):**
  `3 henrietta norton / utkarshrawatofficial@gmail.com / approved` (**test — your Gmail; this was the "welcome henrietta" stale-session account**),
  `4 lucy francis / Mailmeutkarsh1999@gmail.com / approved` (**test — your other Gmail**),
  `6 sam simmons / sam@wildnutrition.com / approved`,
  `7 Anna Jasinska / anna.jasinska@wildnutrition.com / approved`.
  → henrietta (3) and lucy (4) are **test accounts you may want to delete** before real launch.
  sam (6) and anna (7) look like real additions — confirm before touching.
- **No Shopify test store is connected.** Nothing to re-point; when you add a store, register the
  two webhooks (§6.1) against the **production** store from the start.
- **`CRON_SECRET`** was generated this session and set in Vercel. Its plaintext is only in
  `…/scratchpad/cron_secret.txt` (ephemeral scratch — will vanish). If you need it again, read it
  from Vercel or rotate it (`vercel env rm CRON_SECRET production` then re-add).
- **Turso auth token is hardcoded in this session's ad-hoc verification scripts** (the direct
  `node -e` DB queries). It's the real prod token — treat as sensitive; rotate at app.turso.tech
  if you're concerned it leaked into logs.
- **Vercel CLI is already authed** on this machine (`utkarshrawatofficial-2811`, team
  `utkarsh-projects12`). Deploy = `npx vercel --prod --yes`. No token in env.
- **Local preview gotcha:** `.claude/launch.json` runs `next dev`. If the preview server serves
  stale output, it's because a cached `next start` build is being reused — rebuild (`npm run build`)
  or restart. Local runs need a `.env.local` (gitignored); pull with
  `npx vercel env pull .env.local --environment=production` (Turso/Blob values come back but
  sensitive ones like `SESSION_SECRET`/tokens may be blank — set a local `SESSION_SECRET` + omit
  `GMAIL_*` so magic-link falls back to the on-screen dev link).

---

## 8. If picking up in a new session — read these first, in order

1. `CLAUDE.md` — architecture, conventions, gotchas (the no-`/tmp`, no-store-fetch, no-`care@` rules).
2. `PRACTSESSION_HANDOFF.md` — this file (current state + Part 1).
3. `lib/db.ts` — data layer + connection + `getClient()` (runs SCHEMA then migrations).
4. `lib/migrations.ts` — how to add tables/columns safely; the Part-1 table shapes.
5. `lib/access.ts` — the `hasAccess` gate every content Part must call.
6. `app/api/webhooks/shopify/route.ts` + `lib/stats.ts` + `lib/reporting/signals.ts` — the Shopify → orders → revenue path.
7. `app/api/apply/route.ts` + `lib/pipeline.ts` + `lib/practitionerAuth.ts` — onboarding, approval, auto-login, sessions.
8. `PROJECT_HANDOFF.md` — deep history of the pre-existing features (dashboard, AI assistant, lessons, reporting, media).
9. The 7-part build plan (in the user's chat, not the repo) — Parts 2–7 still to build. Order: 2 = homepage/widgets, 3 = pathways/certificates, 4 = toolkit, 5 = events/community, 6 = tiering automation/leaderboard, 7 = content-factory tooling; Phase 3 (mobile/AI-insights/patient-results) is explicitly out of scope.

**Commands:** `npm run dev` (port 3100) · `npm test` (183 passing) · `npm run build` ·
`npm run generate-lessons` (needs key) · `npx vercel --prod --yes`.
