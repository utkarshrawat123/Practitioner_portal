# PRACTSESSION_HANDOFF.md

**Wild Nutrition Practitioner Hub — authoritative session handoff.** Rewritten 2026-07-19 (fresh, complete, exhaustive).
Repo root: `/Users/utkarshrawat/Wild Dash/practitioner-portal` (this dir holds `.git`; the parent `Wild Dash` is **NOT** a git repo).
Branch `main`. Live: https://practitioner-portal-rose.vercel.app · Admin: `/admin` (prod password `wild-admin-2026`).
**319 tests pass · production build clean · everything in §1 is deployed to production.**
(Newest work: **2026-08-02 mobile-responsive pass + dead-code removal, DEPLOYED** — see the block right below.)

This file is the single source of truth for the next session. Agent guide/architecture: `CLAUDE.md`. Early history:
`PROJECT_HANDOFF.md`. Specs + plans: `docs/superpowers/{specs,plans}/`.

> **This session (2026-07-19) shipped FOUR features, all deployed:** (A) Presence "Live Now", (B) card-based admin
> navigation, (C) admin logo → card home, (D) Patient Carts (curated cart → pay link, mock-commerce demo). Details below.

---

# NEWEST SESSION (2026-08-03) — Practitioner-to-practitioner Referral Network — ✅ BUILT + VERIFIED (branch `feat/referral-network`, NOT yet merged/deployed)

"Refer a Colleague": an approved practitioner invites a colleague via a unique link and earns a **£50** in-app
bonus, automatically, when that colleague makes their **first paid sale**. Spec: `docs/superpowers/specs/2026-08-03-practitioner-referral-network-design.md`;
plan: `docs/superpowers/plans/2026-08-03-practitioner-referral-network.md`. Built TDD, **8 tasks, 8 commits** on
branch `feat/referral-network` (branched from `main` @ `32d80b2`). **336 tests pass · build clean · full E2E verified
on the local scratch DB (mobile + desktop).** Additive only — **zero** changes to auth, existing commission, or the
commerce seam.

- **DB** migration `017_practitioner_referrals` — table `practitioner_referrals` (`referrer_id, referred_id UNIQUE,
  referred_email, invite_code, status, qualifying_order_id, bonus_amount, currency, signed_up_at, first_sale_at,
  completed_at, credited_at, created_at`). status ∈ `invited|signed_up|first_sale|completed|credited`. Helpers in
  `lib/db.ts`: `createReferral, getReferralByReferredId, markReferralSignedUp, listReferralsByReferrer,
  referralEarnings, listAllReferrals, creditReferral, maybeAwardReferralBonus, referralBonusGbp`.
- **Award engine** — `recordOrder(o)` now calls `maybeAwardReferralBonus(o.practitionerId, o.orderId)` at the end
  (single choke-point; covers Patient-Carts pay + future Shopify webhook). Idempotent & one-time via the
  `status != 'credited'` guard + `UNIQUE(referred_id)`. Bonus = env **`REFERRAL_BONUS_GBP`** (default 50, robust parse).
- **Attribution** — `/apply?ref=<affiliateCode>` pre-fills an optional "Referred by" box (`ApplyForm.tsx`, read from
  `window.location` to avoid a Suspense boundary). `processApplication` (`lib/pipeline.ts`) resolves the code via
  `findByCode`, guards self/unapproved, and creates the referral (`signed_up` if approved on apply, else `invited`).
  `approvePractitioner` flips `invited → signed_up` on later approval.
- **Practitioner UI** — `/referrals` (`app/referrals/page.tsx` + `components/ReferralsApp.tsx`): invite link + copy,
  referral-earnings totals, and a **4-stage tracker** per referral (Signed up → First purchase → Referral completed →
  Added to earnings) — horizontal on desktop, stacks vertically on mobile. Nav item "Refer & Earn" in `SiteHeader.tsx`
  + a dashboard quick-link. API `GET /api/me/referrals`.
- **Admin** — read-only "Referrals" card in `AdminDashboard` (Insights and ops group) → `components/AdminReferrals.tsx`
  (referrer, referee, status, bonus, date; `overflow-x-auto` table). API `GET /api/admin/referrals`.
- **Deviations from spec** (documented in the plan): dropped the redundant `practitioners.referred_by_practitioner_id`
  column (referral `referred_id` suffices); all helpers live in `lib/db.ts` (no separate `lib/referrals.ts`) so the
  `recordOrder` hook has no import cycle.
- **E2E proof (local scratch DB):** applied "Bob Referred" via Jane's code (`WN-PRACTI-R8SZ`) → referral `signed_up`;
  Bob created + paid a cart (£35.55) → referral auto-advanced to `credited`, `bonus_amount 50`, `qualifying_order_id
  cart-1`; Jane's `/referrals` shows "£50.00 credited" + all 4 stages ✓; admin shows "1 referrals · £50.00 credited".
  No console errors, no horizontal overflow at 375px on any surface.
- **New env:** `REFERRAL_BONUS_GBP` (optional, default 50). Add to Vercel if a non-50 bonus is ever wanted.
- **NOT deployed** — lives on `feat/referral-network`. Merge to `main` + `npx vercel --prod --yes` when ready.

---

# SESSION (2026-08-02) — Mobile-responsive pass + dead-code removal — ✅ DEPLOYED (commit `4b73f86`)

Made both the practitioner and admin sides mobile-friendly, ran a full end-to-end mobile pass, and removed dead
code. **Presentational-only change** — the commit touches **zero** `lib/`, `app/api/`, auth, `db.ts`, or migration
files, so no data/auth/API behaviour changed. **319 tests pass · production build clean · verified live on prod.**

- **Mobile hamburger nav** — `components/HeaderNav.tsx` (**NEW**, client). The signed-in practitioner nav was a
  cramped horizontal-scroll strip; it now collapses to a hamburger drop-down below the `md` breakpoint (desktop nav
  unchanged). `SiteHeader.tsx` (server) still computes the audience-filtered nav items and passes them in as props —
  **no auth/session logic moved**. Drop-down auto-closes on route change (`usePathname` effect) and includes Log out.
- **Patient Carts overflow fix** — `components/CartsApp.tsx`: added `min-w-0` to the left grid column + the
  product-row flex items. CSS grid/flex children default to `min-width:auto`, which forced the page ~456px wide on a
  375px phone (inputs + qty steppers ran off-screen). Now fits the viewport exactly.
- **Admin tables wrapped** — 5 raw `<table>`s blew out the mobile viewport width; each is now wrapped in
  `overflow-x-auto` (grid-child tables also get `min-w-0` so the wrapper can shrink and scroll instead of growing):
  `AdminDashboard` (Applications), `AdminCalendar`, `AdminLessons`, `AdminAiQueries`, `ChatInsights`. Wide tables now
  scroll **inside their card** instead of overflowing the page. (Verified live: Applications table 504px scrolls in a
  327px wrapper; page no longer overflows.)
- **Dead code removed** — the `/coming-soon` route (`app/coming-soon/page.tsx` + `components/ComingSoon.tsx`) —
  nothing linked to it (now **404 on prod**). Also deleted the stale local `data/practitioners.db` (an **untracked**
  local artifact holding old test rows; the `lib/db.ts` last-resort fallback path recreates it on demand — dev uses
  the scratch file DB, prod uses Turso, so removal is inert).
- **Note on diff sizes:** `components/AdminCalendar.tsx` (+75) and `components/ChatInsights.tsx` (+217) show large
  additions only because they were previously **deployed-but-untracked**; this commit brings them under version
  control. The actual edit to each was the 2-line table wrapper.
- **Verified E2E on mobile (local `next dev`, isolated scratch DB, 375px):** every practitioner page + admin section
  walked — no console errors; hamburger opens/navigates/auto-closes; Patient Carts + all admin tables no longer
  overflow; desktop nav confirmed unchanged (regression check).
- **Verified LIVE on prod (read-only, no prod data touched):** new build confirmed live (`/coming-soon`→404); full
  route sweep — every page 200/307 as expected, `/api/resources`→401 (auth gate intact), `/r/[code]`→302,
  `/pay/[token]` renders — **zero 500s**; `/apply` + `/dashboard` render clean on a 375px viewport with no console
  errors.
- **Git/deploy:** committed to `main` as `4b73f86` with a surgical `git add` of exactly the 10 changed files (the
  repo's ~60 pre-existing deployed-but-uncommitted files were left untouched). Deployed via `npx vercel --prod --yes`
  (whole-working-tree deploy, per this repo's convention). The commit was **not** pushed to a git remote (deploys are
  tree-based here, not git-based).

---

# 1. THIS SESSION — acceptance checklist (done / partial / not done, with file paths)

## Feature A — Presence "Live Now" (admin sees which practitioners are online) — ✅ DONE
Admin-only, Messenger-style presence surfaced in the existing **Live Chat** admin tab.
- [x] **Heartbeat** — `components/PresenceBeat.tsx` (renders null; mounted next to `ChatGate` in `app/layout.tsx`).
  POSTs `/api/me/presence` on mount, every 30s while `document.visibilityState==='visible'`, and on regaining focus.
  **Pauses when the tab is hidden** (so "online" = actually at the portal). Writes only the caller's own row.
- [x] **Store** — migration `015_presence` = `ALTER TABLE practitioners ADD COLUMN last_seen_at TEXT`.
  `touchPresence(id)` sets `last_seen_at = datetime('now')` (`lib/db.ts`). Online = seen within `PRESENCE_WINDOW_SECONDS`
  (=90, exported from `lib/db.ts` — single source of truth).
- [x] **Read** — `listOnlinePractitioners(windowSeconds=90)` (approved + within window, newest-first, with open
  `conversationId` or null); `listConversationsForAdmin` gained a computed `online: boolean` per row (uses the same 90s).
  APIs: `app/api/me/presence/route.ts` (POST heartbeat, 401 non-approved), `app/api/admin/presence/route.ts` (GET → `{online,count}`).
- [x] **Admin UI** — `components/AdminChat.tsx`: an **"Online now (N)"** strip + green/grey status dot per conversation row,
  fed by the component's existing 2.5s poll. Clicking an online practitioner opens their thread or starts one.
- [x] **Admin-initiated conversation** — `POST /api/admin/chat` `{practitionerId}` → `{conversationId}` (reuses existing
  `getOrCreateOpenConversation`; no separate helper). `app/api/admin/chat/route.ts`.
- [x] Tests: `tests/presence-db.test.ts` (7), `tests/api-presence.test.ts` (3). Browser-verified end-to-end (heartbeat 204,
  "Online now (1)" green dot, offline transition to grey after 90s, click-to-start-chat opens a thread, no console errors).
- Spec/plan: `docs/superpowers/{specs,plans}/2026-07-19-presence-live-now*.md`.

## Feature B — Card-based admin navigation (replace the 18-item horizontal tab strip) — ✅ DONE
- [x] The admin console opens to a **card home** (grouped section cards) instead of a horizontal scroll — `components/AdminDashboard.tsx`.
  Groups: **Applications** (1 card → opens the review table with Flagged/Approved/Rejected/All filters inside),
  **Content** (Lessons, Media, Pathways, Toolkit, Homepage, Factory, Pearls, Calendar), **Community and events**
  (Community, Events), **Communication** (Live Chat), **Insights and ops** (AI queries, Reporting, Automation). 15 cards total.
- [x] Clicking a card opens that section **full-width** with a **"‹ All sections"** back link. State model: `section`
  (null = card home) replaced the old dual-purpose `tab`; `tab` now only filters the Applications table.
- [x] **Live badges** on cards: Flagged count (dedicated `flaggedCount` fetch) + Live-Chat unread (`chatUnread`).
- [x] Icons via **`lucide-react`** (already a dependency). Nothing was deleted — all 18 sections still reachable.
- [x] Browser-verified: card home renders, Applications filters + table work, Live Chat renders, back nav returns home, no console errors.

## Feature C — Admin logo returns to the card home — ✅ DONE
- [x] The header logo now resets the dashboard to the card home even when a section is open (a plain `<Link href="/admin">`
  didn't remount, so the open section persisted). `components/AdminLogoLink.tsx` (client) dispatches an `admin:home`
  window event; `AdminDashboard` listens and calls the home reset. Keeps `href` so cmd/ctrl-click still opens a tab.
  Files: `components/AdminLogoLink.tsx` (new), `app/admin/page.tsx` (uses it), `components/AdminDashboard.tsx` (listener).
- [x] Browser-verified: from inside Live Chat, clicking the logo instantly returns to the card home (no reload, stays on `/admin`).

## Feature D — Patient Carts: practitioner-curated cart → pay link (EXEC DEMO, mock commerce) — ✅ DONE
Built for an executive presentation. **Runs entirely on a mock commerce provider — NO Shopify required.** Modelled on
Shopify draft orders so the real integration is a drop-in swap later.
- [x] **Provider seam** — `lib/commerce/{types,index,catalog.mock}.ts`. `commerceProvider()` returns `'shopify'` when
  `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` are set, else `'mock'`. `getCatalog()` + `createDraftOrder()` are the two
  functions to implement for real Shopify. Pricing helpers `priceCart()` / `round2()` / `pct()` (10% patient discount,
  20% commission). `MOCK_CATALOG` = 8 real Wild Nutrition products with **real Shopify-CDN product images** (captured from
  `wildnutrition.com/products.json`).
- [x] **DB** — migration `016_patient_carts` (`patient_carts` + `patient_cart_items`). Helpers in `lib/db.ts`:
  `createPatientCart`, `getCartByToken` (with items), `listPatientCartsForPractitioner`, `markCartSent`, `markCartPaid`
  (idempotent, guarded `AND status != 'paid'`). Token = opaque `randomBytes(24)` hex, the public pay-link id.
- [x] **Practitioner UI** — `app/carts/page.tsx` (server shell, redirects non-approved to `/dashboard`) +
  `components/CartsApp.tsx` (cart builder: product grid, live totals + "You earn £X", create pay link, copy + send,
  cart list with status chips). Nav link "Patient Carts" added to `components/SiteHeader.tsx` (`PRACTITIONER_NAV`).
- [x] **Practitioner APIs** — `app/api/me/catalog/route.ts` (GET catalog), `app/api/me/carts/route.ts`
  (GET list / POST create — **server recomputes all prices from the catalog, ignores client-sent prices**),
  `app/api/me/carts/[id]/send/route.ts` (emails the pay link via Gmail SMTP, HTML-escaped, sets status='sent').
- [x] **Patient pay page** — `app/pay/[token]/page.tsx` + `components/PayPage.tsx` (branded WN mock checkout; demo card
  form collects nothing stored/sent; "Payment successful" state). Global chrome hidden on `/pay` via `components/ChromeGate.tsx`.
- [x] **Public pay API** — `app/api/pay/[token]/route.ts`: GET (view cart, 404 unknown token), POST (mock pay → `markCartPaid`
  + `recordOrder(orderId:'cart-<id>', code: practitioner.affiliateCode, total)` → flows into existing dashboard/Reporting
  revenue). **Idempotent** (order id unique + status guard).
- [x] Tests: `tests/commerce-mock.test.ts` (5), `tests/patient-carts-db.test.ts` (4), `tests/api-carts.test.ts` (4),
  `tests/api-pay.test.ts` (2). Browser-verified full demo: build cart (£81.50→£73.35, "You earn £14.67") → pay link →
  branded pay page → "Payment successful" → practitioner dashboard shows revenue £73.35 / 1 order / commission £14.67.
- [x] **Bug found + fixed during the demo run** (commit `55e1e21`): `.env.local` had `COMMISSION_PERCENT=""`, and
  `Number("")` is 0 (and `?? 20` does NOT catch empty strings), so carts stored £0 commission locally. Fixed with a robust
  `pct()` helper (empty/NaN/non-positive → default), read at call-time; regression test added. Production
  (`COMMISSION_PERCENT=20`) was always correct.
- Spec/plan: `docs/superpowers/{specs,plans}/2026-07-19-patient-carts*.md`.
- [~] **Follow-ups (non-blocking, from the final review):** see §6 items 1–3.

---

# 2. DECISIONS MADE THIS SESSION THAT WEREN'T EXPLICITLY SPECIFIED

**Presence (A)**
- **Admin-only, one-directional** (admin sees practitioners; practitioners don't see admin/each other) — user chose this.
- **Online window = 90s, heartbeat = 30s** (invented). Rationale: practitioners aren't glued to the portal; a 30s window
  flickers offline too aggressively. Expressed once as `PRESENCE_WINDOW_SECONDS`; mirrored as a `-90 seconds` literal inside
  the `listConversationsForAdmin` SQL string (kept equal).
- **Heartbeat pauses when the tab is hidden** (invented) so "online" means actually present, not "left a tab open".
- **Presence storage = a column on `practitioners` (`last_seen_at`), not a separate `presence` table** — small table, colocated
  with the row admin already loads, matches the `has_seen_welcome` pattern.
- **Admin-initiated conversations reuse `getOrCreateOpenConversation`** rather than a new `getOrCreateOpenConversationForAdmin`
  helper (spec suggested a wrapper; reused the existing one — same behaviour, less code).

**Card nav (B) + logo (C)**
- **Card home is the landing** (user chose over "land on Flagged"). **Applications = one card** with the 4 filters inside
  (user chose over 4 separate cards).
- **Section grouping** (Applications / Content / Community and events / Communication / Insights and ops) — inferred.
- **Icons via `lucide-react`** (already a dep) rather than inline SVG or a new icon library.
- **State refactor:** introduced `section` (null=home) and kept `tab` purely as the Applications filter, decoupling the old
  dual-purpose `tab`. Added a dedicated `flaggedCount` fetch for the badge (independent of the current filter).
- **Logo → home via a custom `admin:home` window event** (client `AdminLogoLink` dispatches; `AdminDashboard` listens) rather
  than a full-page reload — instant, no flash, stays on `/admin`. Guards modifier-clicks so cmd/ctrl-click still opens a tab.

**Patient Carts (D)**
- **Modelled on Shopify draft orders** (locked cart + a single pay link) as the mental model, but implemented on a **mock
  provider** selected by `commerceProvider()` — mirrors the app's existing "mock until keys" convention.
- **Branded WN mock checkout** (user chose over one-click pay / Shopify-mimic). **Patient discount 10% + practitioner
  commission 20%** (user chose over commission-only). **Copy link + simulated email** delivery (user chose). **Real WN product
  photos** in the catalog (user chose over placeholders). **Lean scope** — no admin "all carts" table; flows into existing
  Reporting (user chose).
- **Pricing defaults invented:** discount 10% (`AFFILIATE_DISCOUNT_PERCENT`, was previously an unset env), commission 20%
  (`COMMISSION_PERCENT`, already 20). Commission computed on the **paid total** (`total × 20%`), discount on the subtotal.
- **Token = opaque `randomBytes(24)` hex stored on the row** (a revocable random token, like a password-reset token) rather
  than an HMAC stateless token — the cart row already exists, so a stored token is simplest/secure.
- **Attribution reuses the existing `recordOrder` pipeline** with `orderId='cart-<id>'` and the practitioner's `affiliateCode`
  as the `code`, so the mock sale lands in the same `orders` table that dashboard + Reporting already read (zero reporting changes).
- **Mock catalog = 8 real WN products** (Lion's Mane Plus £39.50, High Fibre Plus £28, SRI-81™ Shatavari Plus £17, Magnesium
  £20.50, Omega 3 £25, Ashwagandha £24.50, Immune Support £42, Food-Grown® Menopause Complex £39) with real `cdn.shopify.com`
  image URLs. A couple of prices are demo-normalised (clearly a mock).
- **Server always recomputes line-item prices from the catalog; the client's `unitPrice` is discarded** (zod schema only
  accepts `productRef` + `qty`). Client-side totals in `CartsApp` are a **display-only preview** (hardcoded 10/20).
- **`pct()` env parser** (added in the fix): `Number.isFinite(n) && n > 0 ? n : default` — treats unset/empty/non-positive
  as "use default", read at call-time so a runtime/empty env resolves correctly.
- **Chrome hidden on `/pay`** (added `/pay` to `ChromeGate`'s hidden-routes guard) so the patient page shows its own minimal
  branded header, not the practitioner nav.

**Git/process (all four features)**
- Executed **subagent-driven** (fresh implementer per task + per-task review + final Opus whole-branch review).
- **Baseline-first git hygiene:** the working tree carried ~73 pre-existing deployed-but-uncommitted files; several files each
  feature edits (`lib/db.ts`, `lib/migrations.ts`, `AdminDashboard.tsx`, `SiteHeader.tsx`, `ChromeGate.tsx`, `app/admin/page.tsx`,
  `tests/api-chat.test.ts`) were themselves dirty. Before each feature, a `chore: baseline …` commit snapshotted the prior state
  of exactly the files that feature touches, so every subsequent feature commit is a clean, reviewable diff. Nothing was lost;
  ~60+ OTHER unrelated files remain uncommitted on `main`. Task commits used surgical `git add <named files>` — never `git add -A`.

---

# 3. STACK — real vs the "Next.js/Turso" assumption (CONFIRMED + deviations)

The assumed stack IS the real stack. Confirmed running:
- **Next.js 14 App Router** on **Vercel** (serverless). Deploy = `npx vercel --prod --yes` (CLI already authed as
  `utkarshrawatofficial-2811`, team `utkarsh-projects12`). Deploys the WHOLE working tree (not git-based) — **uncommitted
  changes ship**.
- **Vercel plan = HOBBY** ⇒ cron jobs limited to **once per day**; a sub-daily cron schedule FAILS the deploy. (Bit the chat
  missed-message email backstop, which runs daily instead of every 5 min.)
- **Turso (libSQL)** via `@libsql/client` — **raw parameterised SQL, NO ORM**. Every `lib/db.ts` fn is `async`. Schema =
  base `SCHEMA` string + append-only `lib/migrations.ts` (001–016), run on first client connection. The libSQL client is
  wrapped with a `cache:'no-store'` fetch (Next.js otherwise caches query RESULTS → stale admin data). **Do NOT** reintroduce
  a `/tmp` DB fallback or default fetch caching.
- **AI = Google Gemini via raw REST fetch (no SDK)** — the notable deviation from "Anthropic by default". `selectProvider()`
  in `lib/ai/assistant.ts` prefers Gemini, falls back to a dormant Anthropic path. Model `gemini-2.0-flash`. **Both Gemini
  keys currently 429 quota-exhausted** → Ask the Expert, Content Factory, Chat FAQ clustering are dormant.
- **Commerce = a NEW mock provider seam** (`lib/commerce/`) added this session. `commerceProvider()` = mock unless Shopify env
  set. **Shopify is NOT connected** (no store creds). This is the deliberate deviation for the demo — real Shopify is a §6 swap.
- **Email = Gmail SMTP via nodemailer** (`lib/providers/smtp.ts`, `sendSmtpEmail({to,subject,html})`) — no domain needed.
  Resend + Mailchimp code exist but dormant. Order: Resend > Gmail SMTP > Mailchimp/mock.
- **File storage = Vercel Blob** (`@vercel/blob`) — media, certificates, student certifications.
- **Auth:** admin = SHA-256(ADMIN_PASSWORD) cookie `wn_admin` (`lib/adminAuth.ts`, 12h). Practitioner = HMAC-signed
  `wn_session` cookie (`lib/practitionerAuth.ts`, 30d) + 15-min magic-link tokens (`lib/magicLink.ts`). Server components read
  the session via `lib/serverSession.ts getServerSessionPractitioner()`.
- **UI:** Tailwind (brand tokens `ink #191919`, `ink2`, `terracotta #a45248`, `cream #f8f6f3`, `sage #d0d1ab`, `stone #e6e3df`,
  `forest #3a4f41`; heading font Gestura). **`lucide-react`** icons (used by the admin card nav). **zod** validation. **Vitest** (309 tests).
- **No new npm dependencies added this session** (commerce/carts use `crypto` + existing deps; card nav uses the already-present `lucide-react`).

---

# 4. EXACT CURRENT DB SCHEMA (as deployed, base SCHEMA + migrations 001–016)

To re-dump live: `SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%';`

**Base tables (`SCHEMA` in `lib/db.ts`):**
- `practitioners(id PK, name, email UNIQUE, register_body, register_number, qualification_status, tier DEFAULT 'standard',
  status DEFAULT 'pending', verification_json, affiliate_code UNIQUE, affiliate_link, pending_sync DEFAULT 0, created_at,
  decided_at, decided_by,` **+008** `has_seen_welcome DEFAULT 0,` **+014** `certification_url, certification_pathname,
  certification_filename, certification_uploaded_at,` **+015** `last_seen_at)`
- `events(id PK, practitioner_id→practitioners, type, detail, created_at)` — audit trail (NOT the events hub).
- `auth_tokens(token PK, practitioner_id→practitioners, expires_at, used_at)` — magic-link tokens.
- `clicks(id PK, practitioner_id→practitioners, code, created_at)` — referral click log.
- `ai_queries(id PK, practitioner_id→practitioners, profile_input, status, safety_flags, output_json, grounding_warnings,
  model, input_tokens, output_tokens, created_at)` — Ask the Expert log + rate-limit source.
- `lessons(id PK, source_file, title, summary, takeaways_json, quiz_json, topics_json, claim_flags_json, status DEFAULT 'draft',
  model, input_tokens, output_tokens, created_at, decided_at)`
- `lesson_completions(id PK, practitioner_id, lesson_id, completed_at, UNIQUE(practitioner_id, lesson_id))`
- `login_events(id PK, practitioner_id, created_at)`
- `media(id PK, title, type, description, content_kind, url, pathname, thumbnail_url, thumbnail_pathname, size,
  published DEFAULT 1, created_at)`

**Migrations 001–016:**
- **001** `orders(id PK, order_id UNIQUE, practitioner_id→practitioners, code, total REAL, currency DEFAULT 'GBP',
  financial_status, created_at, received_at)` + idx(practitioner_id), idx(code). **Shopify order revenue AND the Patient-Carts
  mock-pay attribution both write here** (`recordOrder`, `ON CONFLICT(order_id) DO UPDATE`).
- **002** `pathways(id PK, title, description, audience DEFAULT 'all', published DEFAULT 0, created_at` **+009** `, category,
  cpd_hours REAL DEFAULT 0)`; `pathway_modules(id PK, pathway_id→pathways, title, content_kind, content_id, position DEFAULT 0,
  required DEFAULT 1)` + idx(pathway_id). content_kind ∈ lesson|media.
- **003** `certificates(id PK, practitioner_id→practitioners, pathway_id→pathways, issued_at, pdf_url,
  UNIQUE(practitioner_id, pathway_id))`
- **004** `toolkit_resources(id PK, title, type, description, audience DEFAULT 'all', content_kind, url, body, pathname,
  thumbnail_url, published DEFAULT 1, created_at)`. type ∈ handout|protocol|decision_tree|recipe|faq|email_template.
- **005** `hub_events(id PK, title, description, starts_at, ends_at, location, audience DEFAULT 'all', recording_url,
  published DEFAULT 1, created_at,` **+010** `event_type DEFAULT 'online', capacity)`;
  `hub_event_registrations(id PK, event_id→hub_events, practitioner_id→practitioners, registered_at,
  UNIQUE(event_id, practitioner_id))` + idx(event_id).
- **006** `tier_history(id PK, practitioner_id→practitioners, tier, computed_at)` + idx;
  `leaderboard_optins(practitioner_id PK→practitioners, opted_in DEFAULT 0, display_name, updated_at)`
- **007** `homepage_widgets(id PK, title, body, link_url, image_url, audience DEFAULT 'all', position DEFAULT 0,
  published DEFAULT 1, created_at)`
- **008** ALTER practitioners ADD `has_seen_welcome DEFAULT 0`; backfilled existing rows to 1.
- **009** ALTER pathways ADD `category`, `cpd_hours`; `module_completions(id PK, practitioner_id, module_id→pathway_modules,
  completed_at, UNIQUE(practitioner_id, module_id))` + idx.
- **010** ALTER hub_events ADD `event_type`, `capacity`; `community_posts(id PK, practitioner_id, author_name,
  post_type DEFAULT 'discussion', title, body, pinned DEFAULT 0, hidden DEFAULT 0, created_at)` + idx;
  `community_replies(id PK, post_id→community_posts, practitioner_id, author_name, body, hidden DEFAULT 0, created_at)` + idx;
  `community_upvotes(post_id→community_posts, practitioner_id, created_at, PRIMARY KEY(post_id, practitioner_id))`
- **011** `email_log(id PK, practitioner_id, job, period, detail, sent_at, UNIQUE(practitioner_id, job, period))`;
  `automation_runs(id PK, job, status, detail, ran_at)` + idx(job, ran_at)
- **012** `clinical_pearls(id PK, body, category, audience DEFAULT 'all', status DEFAULT 'draft', source, created_at)` + idx(status)
- **013** `chat_conversations(id PK, practitioner_id, status DEFAULT 'open', subject, created_at, updated_at,
  last_practitioner_at, last_admin_at, alerted_at)` + idx(status), idx(updated_at), idx(practitioner_id);
  `chat_messages(id PK, conversation_id→chat_conversations, sender, body, created_at, read_by_admin DEFAULT 0,
  read_by_practitioner DEFAULT 0)` + idx(conversation_id). sender ∈ practitioner|admin.
- **014** ALTER practitioners ADD `certification_url`, `certification_pathname`, `certification_filename`, `certification_uploaded_at`.
- **015 (THIS SESSION)** ALTER practitioners ADD `last_seen_at TEXT` — presence heartbeat timestamp.
- **016 (THIS SESSION)** `patient_carts(id PK, practitioner_id→practitioners, patient_name, patient_email, token UNIQUE,
  status DEFAULT 'draft', currency DEFAULT 'GBP', subtotal REAL DEFAULT 0, discount_amount REAL DEFAULT 0, total REAL DEFAULT 0,
  commission_amount REAL DEFAULT 0, provider DEFAULT 'mock', external_id, pay_url, created_at, sent_at, paid_at)` + idx(practitioner_id);
  `patient_cart_items(id PK, cart_id→patient_carts, product_ref, title, image_url, unit_price REAL, qty INTEGER DEFAULT 1)` + idx(cart_id).
  status ∈ draft|sent|paid. provider ∈ mock|shopify. external_id = 'mock-cart' now (Shopify draft id later).
- Bookkeeping: `schema_migrations(id PK, applied_at)`.

**Total: 28 application tables** + schema_migrations (26 prior + `patient_carts` + `patient_cart_items` this session).
`audience` (all|qualified|student) on content tables is the gate via `lib/access.ts hasAccess()`.

---

# 5. ENVIRONMENT VARIABLES IN USE (no secret values)

**Set in Vercel production (live):**
- `TURSO_DATABASE_URL` — libSQL DB URL (libsql://utkarsh-utkarshraw123.aws-eu-west-1.turso.io). Durable prod DB.
- `TURSO_AUTH_TOKEN` — Turso auth token.
- `ADMIN_PASSWORD` — admin console password. **Prod value `wild-admin-2026`** (local dev `preview-admin`).
- `SESSION_SECRET` — HMAC secret for practitioner session cookies AND certification upload tokens.
- `PORTAL_URL` — canonical base URL (the rose URL); builds magic-link + cert-upload URLs.
- `COMMISSION_PERCENT` — affiliate/cart commission % (**=20**). Used by reporting AND Patient-Carts pricing. **NOTE:** empty
  string here would break cart commission (now guarded by `pct()`), but prod is a real `20`.
- `GMAIL_USER` — transactional sender (=utkarshrawatofficial@gmail.com). Presence flips SMTP live.
- `GMAIL_APP_PASSWORD` — Gmail app password (spaces stripped in code).
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob token (auto-provisioned in all Vercel envs).
- `CRON_SECRET` — Bearer secret guarding all `/api/cron/*` endpoints.
- `GEMINI_API_KEY` / `GEMINI_API_KEY2` — Gemini keys (Ask the Expert + Factory + Chat FAQ). **Both currently 429-exhausted.**

**Read by code, optional / currently UNSET (feature runs mock/degraded until set):**
- `AFFILIATE_DISCOUNT_PERCENT` — patient discount % on Patient Carts (default **10** via `pct()`). Also the old Shopify-code discount %.
- `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN` — presence of BOTH flips `commerceProvider()` to `'shopify'` AND (originally)
  enables real Shopify orders/revenue/tiers. **Unset** → Patient Carts uses the mock catalog + mock pay; revenue = £0 from real Shopify.
- `SHOPIFY_WEBHOOK_SECRET` — HMAC for the `/api/webhooks/shopify` order webhook. Unset.
- `STATS_SOURCE` — `shopify-live` switches dashboard/reporting to a live Shopify query. Unset (uses local `orders`).
- `GEMINI_MODEL` (default `gemini-2.0-flash`), `ANTHROPIC_API_KEY` (dormant AI fallback + `npm run generate-lessons`),
  `EMAIL_FROM`, `RESEND_API_KEY`, `MAILCHIMP_API_KEY`, `MAILCHIMP_AUDIENCE_ID`, `ADMIN_ALERT_EMAIL` (default
  utkarshrawatofficial@gmail.com), `CHAT_ALERT_MINUTES` (default 5), `KB_DIR` (default `knowledge/`). All unset.
- `DB_PATH` — test/local file-DB path (set by tests + `.env.development.local`). Not a prod var.
- `VERCEL`, `AWS_LAMBDA_FUNCTION_NAME` — runtime-provided serverless flags (do not set).

**Local `.env.local` gotcha:** it contains `COMMISSION_PERCENT=""` (empty). Harmless now (the `pct()` fix falls back to 20),
but do NOT rely on local commission matching prod unless you set a real value there.

---

# 6. LEFT BROKEN / STUBBED / PARTIAL — and exactly how to finish

**New this session (Patient Carts follow-ups — non-blocking, from the final review; a task chip was spawned for #1):**
1. **`getCatalog`/`createDraftOrder` always return mock even when `commerceProvider()==='shopify'`** (`lib/commerce/index.ts`).
   If someone sets `SHOPIFY_STORE_DOMAIN`/`SHOPIFY_ADMIN_TOKEN` in prod, the provider flips to 'shopify' but catalog/checkout
   silently stay mock — a half-activated state. **Finish:** add a guard that throws "Shopify provider not implemented" when
   shopify-selected-but-unimplemented, then implement the real Shopify branch (see §7 Shopify swap).
2. **`CartsApp` swallows non-OK create responses** (`components/CartsApp.tsx`) — a failed cart create (e.g. bad email failing
   server zod) just re-enables the button with no message. **Finish:** surface the server error in the UI.
3. **`PayPage` `money()` hardcodes `£`** (`components/PayPage.tsx`) — ignores `cart.currency`. Harmless (all GBP). **Finish:**
   format by currency if you ever sell in another.

**The real Shopify swap for Patient Carts (the big one — turns the demo into production commerce):**
- Set `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` (+ `SHOPIFY_WEBHOOK_SECRET`).
- Implement the `shopify` branch of `getCatalog()` (products API) and `createDraftOrder()` (Admin API draft order →
  `invoice_url`), attaching the practitioner's discount code + `note_attributes.practitioner_id` for attribution.
- Point `pay_url` to the Shopify `invoice_url` (retire our `/pay` page for real orders, or keep as fallback).
- Extend `app/api/webhooks/shopify/route.ts` to also read `note_attributes.practitioner_id` and reconcile the
  `patient_carts` row to `paid` by `external_id`. No schema/UI change needed. Spec §9 of the patient-carts design.

**Carried from before (still open):**
4. **Gemini 429 quota-exhausted (BLOCKS 3 features)** — Ask the Expert (`/assistant`), Content Factory, Chat FAQ consolidation
   reach Google but get 429 on both keys. **Finish:** enable billing / raise quota, OR add a key on a different Google project,
   OR set `ANTHROPIC_API_KEY` for the dormant Claude path. No code change.
5. **KB is still 5 SAMPLE docs** (`knowledge/`) — Ask the Expert only cites these. **Finish:** replace with real WN dossiers.
6. **Chat missed-message email is DAILY not 5-min** (Vercel Hobby cron limit). In-app popup unaffected. **Finish:** upgrade to
   Vercel Pro, change `vercel.json` cron `/api/cron/chat-alerts` from `0 7 * * *` to `*/5 * * * *`.
7. **Real Shopify NOT connected** (beyond Patient Carts) — tiers stay Standard, real revenue £0. Same env as the swap above.
8. **Sentry / error monitoring NOT wired** — errors are `console.error` + `ai_queries`/`automation_runs` logs.
9. **Cert / media / Blob uploads can't be exercised under `next dev`** (`.env.development.local` blanks `BLOB_READ_WRITE_TOKEN`).
   Covered by mocked-Blob unit tests; works in prod.
10. **Coming-soon stubs remain** (Book Technical Consultation, Student Mentoring, My Downloads). **Facebook Group URL is a
    PLACEHOLDER** in `components/CommunityApp.tsx` (`FB_GROUP_URL`).
11. **`createPatientCart` inserts cart + items without a transaction** (`lib/db.ts`) — orphan-cart risk on a mid-loop failure.
    Matches the codebase-wide convention (no transactions anywhere), not a regression; fine for the demo.

---

# 7. TEST DATA / SANDBOX / MANUAL STEPS TO REDO IF STARTING FRESH

- **Local dev MUST use the `portal-dev` launch config (`next dev`), NOT `portal` (`next start`)** — `portal` runs prod mode and
  would hit prod Turso. Launch configs are in the ROOT `Wild Dash/.claude/launch.json` (port 3100). Admin password locally = `preview-admin`.
- **`.env.development.local` (gitignored)** forces `DB_PATH` to a scratch file DB and blanks TURSO + Blob, so `next dev` never
  touches prod. **`.env.local` has `COMMISSION_PERCENT=""`** (see §5 gotcha).
- **Browser verification this session used an ISOLATED LOCAL scratch DB.** Test rows created locally ("Course Learner"
  practitioner, "Sarah Thompson"/"Commission Check" patient carts, "Chat Tester", presence test rows) live only in the scratch
  DB → **nothing to clean in prod from this session.**
- **Vercel CLI is authed** (`vercel whoami` → utkarshrawatofficial-2811, team utkarsh-projects12). Deploy = `npx vercel --prod
  --yes` from this dir. It ships the WHOLE working tree (uncommitted included). **Check `vercel whoami` before claiming you can't deploy.**
- **Admin prod password = `wild-admin-2026`.** Turso web console is the way to edit prod data (the sandbox blocks prod DB writes).
- **No Shopify store connected** — nothing to re-point yet. When connecting, register the order-paid webhook →
  `app/api/webhooks/shopify` (HMAC via `SHOPIFY_WEBHOOK_SECRET`), and implement the `lib/commerce` shopify branch (§6 swap).
- **Patient-Carts mock catalog images** are hotlinked `cdn.shopify.com` URLs captured from `wildnutrition.com/products.json`
  (`lib/commerce/catalog.mock.ts`). If any image 404s later, re-capture or download into `public/catalog/` (the design has a fallback path).
- **Prod test practitioners from EARLIER sessions may still exist** (henrietta/lucy + `*@example.com`). Delete before real launch via Turso console.
- **The repo working tree has ~60+ pre-existing uncommitted files** from prior sessions (deployed-but-uncommitted). This session
  used baseline-first commits (see §2) so all feature commits are clean. If you want a fully clean `git status`, review and commit
  the remainder deliberately — do NOT blind-commit everything.
- **A background task chip is pending** ("Guard commerce provider against half-activating Shopify") — see §6 item 1.

---

# 8. IF PICKING UP IN A NEW SESSION — READ THESE FIRST, IN ORDER

1. **THIS FILE** (`PRACTSESSION_HANDOFF.md`) — authoritative state.
2. `CLAUDE.md` — architecture map, conventions, critical gotchas (no-store fetch, care@ ban, name-based verification), and the
   per-feature sections (Patient Carts, Presence, Live Chat, student cert).
3. `lib/db.ts` — the entire data layer (all async; `SCHEMA` + helpers). `lib/migrations.ts` — append-only, 001–016.
4. **Patient Carts:** `lib/commerce/{index,types,catalog.mock}.ts` (the provider seam + swap point) →
   `app/api/me/carts/route.ts` + `app/api/pay/[token]/route.ts` (server-price recompute + attribution) →
   `components/CartsApp.tsx` + `components/PayPage.tsx`. Spec/plan: `docs/superpowers/{specs,plans}/2026-07-19-patient-carts*.md`.
5. **Presence:** `components/PresenceBeat.tsx` + `app/api/{me,admin}/presence/route.ts` + `listOnlinePractitioners`/
   `touchPresence`/`PRESENCE_WINDOW_SECONDS` in `lib/db.ts` + the online strip in `components/AdminChat.tsx`.
   Spec/plan: `docs/superpowers/{specs,plans}/2026-07-19-presence-live-now*.md`.
6. **Admin card nav + logo:** `components/AdminDashboard.tsx` (section/`GROUPS` model), `components/AdminLogoLink.tsx`, `app/admin/page.tsx`.
7. `lib/pipeline.ts` + `lib/decision.ts` + `lib/certUpload.ts` — onboarding/approval + student cert email.
8. `lib/ai/assistant.ts` (Gemini provider selection) & `lib/ai/kb.ts` — Ask the Expert (dormant on 429).
9. Env + deploy facts in §5/§7 before touching prod.

**Commands:** `npm run dev` (→ http://localhost:3100, use `portal-dev` launch), `npm test` (**309 passing** — keep green),
`npm run build` (type-check gate; stop any running dev server first — it corrupts `.next` page-data collection),
`npx vercel --prod --yes` (deploy). Admin console is now a **card home** (15 section cards). Parts 1–8 + Presence + Patient
Carts built. Remaining: Shopify connect (for real commerce + the Patient-Carts swap) · Gemini quota · real KB.
