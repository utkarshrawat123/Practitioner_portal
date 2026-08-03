# Wild Nutrition Practitioner Hub — MASTER HANDOVER

**This is the single, self-contained, exhaustive entry point for a new session.** Read this first; it
supersedes the older `PRACTSESSION_HANDOFF.md` (kept for its per-session detail) and `PROJECT_HANDOFF.md`
(earliest history). `CLAUDE.md` is the terse agent guide. Last rewritten **2026-08-03**.

- **Repo root:** `/Users/utkarshrawat/Wild Dash/practitioner-portal` — this dir holds `.git`. The parent
  `Wild Dash/` is **NOT** a git repo. Branch **`main`**, HEAD **`ee09440`**.
- **Live:** https://practitioner-portal-rose.vercel.app · **Admin:** `/admin`, prod password **`wild-admin-2026`**.
- **State:** **336 tests pass · production build clean · everything below is deployed to production.**

---

## 0. TL;DR / QUICK START

```bash
npm run dev       # local dev → http://localhost:3100 (use the 'portal-dev' launch config, NOT 'portal')
npm test          # Vitest — 336 tests, keep green
npm run build     # production build + type-check gate (STOP the dev server first — it corrupts .next)
npx vercel --prod --yes   # deploy to production (CLI authed as utkarshrawatofficial-2811, team utkarsh-projects12)
npm run generate-lessons  # offline lesson pipeline (needs ANTHROPIC_API_KEY)
```

- **What it is:** a Next.js 14 (App Router) practitioner community platform for Wild Nutrition — onboarding +
  register verification, a passwordless practitioner dashboard, an AI protocol assistant, education/lessons,
  media/resources, clinical toolkit, community + events, live chat, patient carts (curated cart → pay link),
  a practitioner-to-practitioner referral network, and a password-gated admin console with reporting.
- **Single Next.js app** deployed to Vercel (serverless). **Turso (libSQL)** database, **raw parameterised SQL,
  no ORM.** External integrations run in **mock/degraded mode without keys** so the whole app is exercisable.
- **Deploys ship the ENTIRE working tree** (uncommitted files included), not git-based. ~70 pre-existing
  deployed-but-uncommitted files sit on `main` — do NOT assume `git status` clean == what's deployed, and do
  NOT blind-commit everything.

---

## 1. TECH STACK (real, confirmed)

- **Next.js 14 App Router** on **Vercel (Hobby plan)**. Hobby ⇒ **cron limited to once/day** — a sub-daily
  schedule fails the deploy.
- **Turso (libSQL)** via `@libsql/client` — raw parameterised SQL. Every `lib/db.ts` fn is `async`. Schema =
  base `SCHEMA` string + append-only `lib/migrations.ts` (001–017), run on first client connection. The libSQL
  client is wrapped with a `cache:'no-store'` fetch (Next.js otherwise caches query RESULTS → stale admin data).
  **Do NOT** reintroduce a `/tmp` DB fallback or default fetch caching.
- **AI = Google Gemini via raw REST fetch (no SDK).** `selectProvider()` in `lib/ai/assistant.ts` prefers Gemini
  (`GEMINI_API_KEY` → `GEMINI_API_KEY2`), falls back to a dormant Anthropic path. Model `gemini-2.0-flash`.
  **Both Gemini keys are currently 429 quota-exhausted** → Ask the Expert, Content Factory, Chat FAQ clustering
  are dormant (they degrade gracefully).
- **Commerce = a mock provider seam** (`lib/commerce/`). `commerceProvider()` returns `'shopify'` when
  `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` are set, else `'mock'`. **Shopify is NOT connected.**
- **Email = Gmail SMTP via nodemailer** (`lib/providers/smtp.ts`). Resend + Mailchimp exist but dormant.
  Order of preference: Resend > Gmail SMTP > Mailchimp/mock.
- **File storage = Vercel Blob** (`@vercel/blob`) — media, certificates.
- **UI:** Tailwind (brand tokens below), **`lucide-react`** icons, **framer-motion** (welcome takeover),
  **zod** validation, **Vitest** tests. **`pdf-lib`** for certificates. `better-sqlite3` is a test/local dep.
- **Brand tokens:** `ink #191919`, `ink2`, `terracotta #a45248`, `cream #f8f6f3`, `sage #d0d1ab`,
  `stone #e6e3df`, `forest #3a4f41`; heading font Gestura (`font-heading`). Practitioner containers
  `mx-auto max-w-5xl px-6 py-10`; admin `max-w-7xl`.

---

## 2. REPO LAYOUT

```
app/            Next.js routes (pages + api). See §4.
components/     42 React components (client + a few server). See §5.
lib/            Domain logic + data layer (db.ts is the whole data layer). See §6.
tests/          79 Vitest files, 336 tests. Harness: DB_PATH temp file + resetDbForTests() + execForTests().
docs/superpowers/{specs,plans}/   Design specs + implementation plans, one per feature.
knowledge/      5 SAMPLE KB docs for Ask the Expert (replace with real WN dossiers).
content-sources/, data/, scripts/, next.config.mjs, tailwind.config.ts, vercel.json
CLAUDE.md               Terse agent guide.
HANDOVER.md             THIS FILE — master handover.
PRACTSESSION_HANDOFF.md Per-session detail blocks (2026-07-19 → 2026-08-03).
PROJECT_HANDOFF.md      Earliest history.
```

---

## 3. COMPLETE FEATURE INVENTORY

Parts 1–8 + Presence + Patient Carts + Mobile pass + Referral Network are all **built and deployed.**

1. **Onboarding + register verification** — `/apply` (`ApplyForm`) → `POST /api/apply` → `lib/pipeline.ts`
   `processApplication`. Name-based register verification (`lib/registers/*` — registers expose no number/API
   lookup). Auto-approve only on qualified + high-confidence match, else **flagged**. Approved-on-apply
   practitioners are **auto-logged-in** (session cookie set in the apply route). Decision logic in
   `lib/decision.ts`. Register bodies: BANT, CNHC, NNA, ANP.
2. **Student certification** — a **student** applicant is flagged (`STUDENT_MANUAL`) AND emailed a secure,
   self-expiring upload link (`lib/certUpload.ts`, HMAC `cert:`-prefixed token — never a login session). They
   upload proof at `/upload-certification?token=…` → `POST /api/certification` → Vercel Blob under
   `certifications/` (migration `014` adds `certification_*` columns). Admin Flagged detail shows a
   "Student certification" block.
3. **Practitioner dashboard** — `/dashboard` (server shell → redirects first-login to `/onboarding/welcome`,
   else renders `DashboardApp`). Shows referral/affiliate stats (clicks, orders, revenue, commission via
   `lib/stats.ts computeStats`), continue-learning, quick links, referral earnings.
4. **Welcome takeover** — `/onboarding/welcome` (`WelcomeExperience`, framer-motion cinematic scroll). Plays on
   **every login** via the per-login `wn_welcome` session cookie (`lib/welcomeGate.ts`), dismissed by
   `POST /api/me/seen-welcome`. Fonts Fraunces/Inter scoped to this route only.
5. **Ask the Expert (AI)** — `/assistant` (`AssistantApp`) → `POST /api/assistant` → `lib/ai/*` (KB/RAG in
   `lib/ai/kb.ts`, safety in `lib/ai/safety.ts`, assistant in `lib/ai/assistant.ts`). Cites all supporting KB
   docs, drops fabricated citations. **Dormant on Gemini 429.** Rate-limited via `ai_queries` table.
6. **Learning / Pathways** — `/learning` + `/learning/[id]` (`LearningCatalogue`, `PathwayDetail`), CPD hours,
   module completions, certificates (`lib/certificates.ts`, migration `003`/`009`). `/cpd` (`CpdApp`) tracks CPD.
7. **Lessons / Library** — `/library` (`LibraryApp`) education lessons (migration base `lessons`), completions.
   Offline generation: `npm run generate-lessons` (`lib/lessons/*`, needs `ANTHROPIC_API_KEY`).
8. **Media / Resources** — `/resources` (`ResourcesApp`, `MediaCard`) media library; admin uploads via Vercel
   Blob + thumbnails (`lib/media/thumbnail.ts`).
9. **Clinical Toolkit** — `/toolkit` (`ToolkitApp`) handouts/protocols/decision-trees/recipes/faqs/email-
   templates (migration `004`).
10. **Clinical Pearls** — surfaced content (migration `012`), admin-curated.
11. **Community** — `/community` (`CommunityApp`) posts/replies/upvotes (migration `010`). **Facebook Group URL
    is a PLACEHOLDER** (`FB_GROUP_URL` in `CommunityApp.tsx`).
12. **Events** — `/events` (`EventsApp`) hub events + registrations (migration `005`/`010`), ICS export
    (`lib/events/ics.ts`).
13. **Leaderboard** — `/leaderboard` (`LeaderboardApp`) opt-in leaderboard (migration `006`).
14. **Automation** — scheduled jobs (migration `011`, `lib/automation/*`) — tiering, lifecycle, engagement
    emails. Cron endpoints under `/api/cron/*` guarded by `CRON_SECRET`. Hobby ⇒ once/day.
15. **Live Chat (Part 8)** — fast-polling (~2.5s) practitioner↔admin support chat (`ChatWidget` via `ChatGate`
    in layout; admin side `AdminChat`). Migration `013`. Daily email backstop `cron/chat-alerts` (Hobby cron).
    Insights/FAQ clustering `ChatInsights` (`lib/ai/chatInsights.ts`, degrades on 429).
16. **Presence "Live Now"** — admin sees which practitioners are online. Heartbeat `PresenceBeat` →
    `POST /api/me/presence` every 30s while tab focused (pauses when hidden) → `practitioners.last_seen_at`
    (migration `015`). Online = seen within `PRESENCE_WINDOW_SECONDS` (=90). Admin "Online now (N)" strip +
    dots in `AdminChat`. Admin-initiated chat via `POST /api/admin/chat {practitionerId}`.
17. **Patient Carts** — practitioner builds a cart for a patient → tokenised login-free pay link → patient pays
    on a branded **mock** checkout → sale attributed to the practitioner via `recordOrder` → shows in
    dashboard/Reporting. `/carts` (`CartsApp`), `/pay/[token]` (`PayPage`, chrome hidden via `ChromeGate`).
    Provider seam `lib/commerce/`, migration `016`. Pricing: 10% patient discount, 20% commission. **Mock
    catalog = 8 real WN products** with real `cdn.shopify.com` images (`lib/commerce/catalog.mock.ts`).
18. **Admin console** — `/admin` (`AdminDashboard`), a **card home** of grouped section cards (Applications /
    Content / Community and events / Communication / Insights and ops). Logo returns to card home
    (`AdminLogoLink` + `admin:home` event). 16 sections. See §4 for the section list.
19. **Mobile-responsive pass (2026-08-02)** — see §10.
20. **Practitioner-to-practitioner Referral Network (2026-08-03)** — see §9. THE NEWEST FEATURE.

---

## 4. ROUTES — pages, APIs, admin sections

**Pages (`app/**/page.tsx`):** `/` (→ redirects to `/apply`), `/apply`, `/dashboard`, `/onboarding/welcome`,
`/assistant`, `/learning`, `/learning/[id]`, `/library`, `/resources`, `/toolkit`, `/community`, `/events`,
`/leaderboard`, `/cpd`, `/carts`, `/pay/[token]`, `/referrals`, `/upload-certification`, `/admin`.

**Practitioner/public APIs:** `/api/apply`, `/api/me` (+ `/me/stats`, `/me/widgets`, `/me/seen-welcome`,
`/me/presence`, `/me/catalog`, `/me/carts` (+`/[id]/send`), `/me/chat`, `/me/cpd`, `/me/community` (+`/[id]`,
`/reply`, `/upvote`), `/me/events` (+`/[id]/register`), `/me/pathways` (+`/[id]`, `/complete`), `/me/pearls`,
`/me/leaderboard`, `/me/toolkit`, `/me/referrals`), `/api/auth/{request-link,verify,logout}`,
`/api/library` (+`/[id]/complete`), `/api/resources`, `/api/assistant`, `/api/certification`,
`/api/pay/[token]`, `/api/r/[code]` (referral click → redirect), `/api/webhooks/shopify`,
`/api/cron/{heartbeat,run,chat-alerts}`.

**Admin APIs (all `isAuthed`-gated):** `/api/admin/{login,logout,practitioners (+/[id]),ai-queries,lessons
(+/[id]),reporting (+/export),media (+/[id],/upload,/thumbnail,/cleanup),widgets (+/[id]),pathways (+/[id],
/modules,/content),toolkit (+/[id]),events (+/[id]),community (+/[id]),pearls (+/[id]),factory,automation
(+/run),calendar,presence,chat (+/[id],/close,/insights,/insights/faqs),referrals}`.

**Admin console sections (cards in `AdminDashboard`):** Applications · Lessons · Media · Pathways · Toolkit ·
Homepage · Factory · Pearls · Calendar · Community · Events · Live Chat · AI queries · Reporting · **Referrals** ·
Automation. Each renders its `Admin*` component.

---

## 5. COMPONENTS (42)

**Chrome:** `SiteHeader` (server, context-aware nav), `HeaderNav` (client, desktop nav + mobile hamburger),
`LogoutButton`, `ChromeGate` (hides header/footer on `/onboarding/*`, `/pay`), `ChatGate`, `PresenceBeat`,
`AdminLogoLink`.
**Practitioner apps:** `ApplyForm`, `DashboardApp`, `WelcomeExperience`, `AssistantApp`, `LearningCatalogue`,
`PathwayDetail`, `LibraryApp`, `ResourcesApp`, `MediaCard`, `ToolkitApp`, `CommunityApp`, `EventsApp`,
`LeaderboardApp`, `CpdApp`, `CartsApp`, `PayPage`, `ChatWidget`, `ReferralsApp`, `CertificationUpload`.
**Admin:** `AdminDashboard` (+ `AdminAiQueries`, `AdminAutomation`, `AdminCalendar`, `AdminChat`,
`AdminCommunity`, `AdminEvents`, `AdminFactory`, `AdminLessons`, `AdminMedia`, `AdminPathways`, `AdminPearls`,
`AdminReferrals`, `AdminReporting`, `AdminToolkit`, `AdminWidgets`, `ChatInsights`).

---

## 6. DATA LAYER + LIB

- **`lib/db.ts`** — the ENTIRE data layer, all `async`, uses private `run`/`one`/`all`/`num` helpers +
  `rowToPractitioner`/`rowToReferral` mappers. `SCHEMA` exported for tests. Connection selection: line ~199
  `TURSO_DATABASE_URL` wins; else `DB_PATH` (as `file:`); else throws in serverless / falls to
  `data/practitioners.db` locally. **`resetDbForTests()`** + **`execForTests()`** for tests.
- **`lib/migrations.ts`** — append-only `{id, sql}[]`, 001–017 (§7). `runMigrations(client)` applies once each.
- **Domain libs:** `pipeline.ts` (application processing + referral attribution), `decision.ts` (auto-approve/
  flag), `registers/*` (name-based verification), `codes.ts` (`portalUrl`, `referralLink`, `generateCode`),
  `access.ts` (`hasAccess` audience gate), `stats.ts` (`computeStats`), `reporting/*`, `ai/*`, `lessons/*`,
  `automation/*`, `chat/*`, `commerce/*`, `events/*`, `media/*`, `certUpload.ts`, `certificates.ts`,
  `magicLink.ts`, `welcomeGate.ts`, `serverSession.ts`, `presence/config.ts`, `providers/*`, `emails/templates.ts`.
- **Auth libs:** `adminAuth.ts` (`isAuthed(req)`), `practitionerAuth.ts` (`getSessionPractitioner(req)`,
  `sessionCookieHeader(id)`), `serverSession.ts` (`getServerSessionPractitioner()`).

---

## 7. COMPLETE DB SCHEMA (base + migrations 001–017)

To dump live: `SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%';`

**Base tables (`SCHEMA` in `lib/db.ts`):**
- `practitioners(id PK, name, email UNIQUE, register_body, register_number, qualification_status,
  tier DEFAULT 'standard', status DEFAULT 'pending', verification_json, affiliate_code UNIQUE, affiliate_link,
  pending_sync DEFAULT 0, created_at, decided_at, decided_by,` **+008** `has_seen_welcome DEFAULT 0,`
  **+014** `certification_url, certification_pathname, certification_filename, certification_uploaded_at,`
  **+015** `last_seen_at)`
- `events(id PK, practitioner_id, type, detail, created_at)` — audit trail (NOT the events hub).
- `auth_tokens(token PK, practitioner_id, expires_at, used_at)` — magic-link tokens.
- `clicks(id PK, practitioner_id, code, created_at)` — referral click log.
- `ai_queries(id PK, practitioner_id, profile_input, status, safety_flags, output_json, grounding_warnings,
  model, input_tokens, output_tokens, created_at)` — Ask-the-Expert log + rate-limit source.
- `lessons(id PK, source_file, title, summary, takeaways_json, quiz_json, topics_json, claim_flags_json,
  status DEFAULT 'draft', model, input_tokens, output_tokens, created_at, decided_at)`
- `lesson_completions(id PK, practitioner_id, lesson_id, completed_at, UNIQUE(practitioner_id, lesson_id))`
- `login_events(id PK, practitioner_id, created_at)`
- `media(id PK, title, type, description, content_kind, url, pathname, thumbnail_url, thumbnail_pathname,
  size, published DEFAULT 1, created_at)`

**Migrations:**
- **001** `orders(id PK, order_id UNIQUE, practitioner_id, code, total REAL, currency DEFAULT 'GBP',
  financial_status, created_at, received_at)` + idx(practitioner_id), idx(code). **Shopify order revenue AND
  Patient-Carts mock-pay AND referral qualifying sales all write here** (`recordOrder`, ON CONFLICT upsert).
- **002** `pathways(...)` **+009** `+ category, cpd_hours`; `pathway_modules(...)`. content_kind ∈ lesson|media.
- **003** `certificates(... UNIQUE(practitioner_id, pathway_id))`.
- **004** `toolkit_resources(...)`. type ∈ handout|protocol|decision_tree|recipe|faq|email_template.
- **005** `hub_events(...)` **+010** `+ event_type, capacity`; `hub_event_registrations(... UNIQUE(event_id, practitioner_id))`.
- **006** `tier_history(...)`; `leaderboard_optins(practitioner_id PK, opted_in, display_name, updated_at)`.
- **007** `homepage_widgets(...)`.
- **008** ALTER practitioners ADD `has_seen_welcome`.
- **009** ALTER pathways ADD `category`, `cpd_hours`; `module_completions(... UNIQUE(practitioner_id, module_id))`.
- **010** ALTER hub_events ADD `event_type`, `capacity`; `community_posts(...)`, `community_replies(...)`,
  `community_upvotes(post_id, practitioner_id, PRIMARY KEY(post_id, practitioner_id))`.
- **011** `email_log(... UNIQUE(practitioner_id, job, period))`; `automation_runs(...)`.
- **012** `clinical_pearls(...)`.
- **013** `chat_conversations(...)`, `chat_messages(...)`. sender ∈ practitioner|admin.
- **014** ALTER practitioners ADD `certification_url/pathname/filename/uploaded_at`.
- **015** ALTER practitioners ADD `last_seen_at` (presence heartbeat).
- **016** `patient_carts(id PK, practitioner_id, patient_name, patient_email, token UNIQUE,
  status DEFAULT 'draft', currency, subtotal, discount_amount, total, commission_amount, provider DEFAULT 'mock',
  external_id, pay_url, created_at, sent_at, paid_at)` + idx; `patient_cart_items(id PK, cart_id, product_ref,
  title, image_url, unit_price, qty)` + idx. status ∈ draft|sent|paid.
- **017 (NEWEST)** `practitioner_referrals(id PK, referrer_id → practitioners, referred_id → practitioners,
  referred_email, invite_code, status DEFAULT 'invited', qualifying_order_id, bonus_amount REAL DEFAULT 0,
  currency DEFAULT 'GBP', signed_up_at, first_sale_at, completed_at, credited_at, created_at)` +
  idx(referrer_id) + **UNIQUE(referred_id)**. status ∈ invited|signed_up|first_sale|completed|credited.
- Bookkeeping: `schema_migrations(id PK, applied_at)`.

`audience` (all|qualified|student) on content tables gates via `lib/access.ts hasAccess()`.

---

## 8. AUTH MODEL

- **Admin** — `lib/adminAuth.ts`. Cookie `wn_admin` = `SHA-256(ADMIN_PASSWORD)` hex (64 chars), 12h. `isAuthed(req)`
  checks it. Login `POST /api/admin/login`. **Prod password `wild-admin-2026`; local dev `preview-admin`.**
- **Practitioner** — `lib/practitionerAuth.ts`. HMAC-signed `wn_session` cookie (30d) via `SESSION_SECRET`.
  `getSessionPractitioner(req)` verifies + loads; require `status === 'approved'`. Server components use
  `lib/serverSession.ts getServerSessionPractitioner()`. Approved-on-apply sets the cookie directly (auto-login).
- **Magic links** — `lib/magicLink.ts`, 15-min tokens in `auth_tokens`. `POST /api/auth/request-link` emails a
  link (**locally, GMAIL is blanked so it returns an on-screen `devLink` instead of emailing**);
  `GET /api/auth/verify?token=…` sets the session cookie. **On prod GMAIL is set → it emails, no devLink.**
- **Certification upload tokens** — `lib/certUpload.ts`, HMAC `cert:`-prefixed (via `SESSION_SECRET`), never a
  login session, self-expiring.
- **Welcome gate** — per-login session cookie `wn_welcome` (`lib/welcomeGate.ts`), separate from the permanent
  `has_seen_welcome` column.

---

## 9. THE REFERRAL NETWORK (newest, 2026-08-03) — full detail

**"Refer a Colleague": an approved practitioner invites a colleague via a unique link and earns £50 (in-app,
tracked) automatically when that colleague makes their first paid sale.** Spec:
`docs/superpowers/specs/2026-08-03-practitioner-referral-network-design.md`; plan:
`docs/superpowers/plans/2026-08-03-practitioner-referral-network.md`. Built TDD, 8 tasks, merged to `main`, deployed.

**Locked decisions:** invite link (`/apply?ref=<affiliateCode>`) + optional manual code box; **automatic** award
on first paid sale (no admin approval); tracked **in-app** as referral earnings (no real payout).

**The four stages** (`practitioner_referrals.status` drives the UI tracker):
| UI label | status | set when |
|---|---|---|
| Signed up | `signed_up` | referee applies via the link AND is approved |
| First purchase completed | `first_sale` | referee's first qualifying order recorded |
| Referral completed | `completed` | referral qualifies (same txn as first_sale) |
| Added to earnings | `credited` | £50 stamped on the row |

Internal-only `invited` = referee applied but not yet approved (flagged/pending). On the automatic path
`first_sale → completed → credited` happen in one transaction; a referral dwells at `signed_up` until the
colleague's first paid sale, then completes fully.

**Data model:** migration `017_practitioner_referrals` (§7). **The spec's `practitioners.referred_by_practitioner_id`
column was intentionally dropped** — `referred_id` fully captures the relationship (the applicant always has a
practitioner row, so it's never NULL; `UNIQUE(referred_id)` cleanly enforces one referral per referee).

**`lib/db.ts` helpers:** `createReferral({referrerId, referredId, referredEmail, inviteCode, approved})`
(INSERT OR IGNORE, status signed_up|invited), `getReferralByReferredId`, `markReferralSignedUp` (invited→signed_up),
`listReferralsByReferrer` (→ `ReferralView` with refereeName/refereeStatus), `referralEarnings`
(→ `{creditedTotal, pendingCount}`), `listAllReferrals` (admin, + referrerName), `creditReferral`
(one-shot → credited), `maybeAwardReferralBonus(referredPractitionerId, orderId)`, `referralBonusGbp()`
(env `REFERRAL_BONUS_GBP`, default 50, empty/NaN/≤0 → 50). Types `ReferralRow`, `ReferralView`.

**Award engine:** `recordOrder(o)` (in `lib/db.ts`) calls `maybeAwardReferralBonus(o.practitionerId, o.orderId)`
at its END — a **single choke-point** covering the Patient-Carts pay API and the Shopify webhook. Idempotent &
one-time via `status != 'credited'` guard + `UNIQUE(referred_id)`. **v1 credits on ANY recorded order for a
referred practitioner** (all current sale sources are paid; if real Shopify later sends unpaid/pending orders,
gate on `financialStatus === 'paid'`).

**Attribution:** `ApplyForm.tsx` reads `?ref=` from `window.location` (deliberately NOT `useSearchParams`, to
avoid a Suspense boundary requirement at build) into an optional "Referred by" field named `referredByCode`.
`app/api/apply/route.ts` zod schema accepts optional `referredByCode` (max 30). `lib/pipeline.ts`
`processApplication` resolves it via `findByCode`, guards (self-email/self-id/unapproved-referrer → ignored,
never blocks signup), and `createReferral` (signed_up if approved on apply, else invited). `approvePractitioner`
calls `markReferralSignedUp(id)` so a later-approved flagged referee flips invited→signed_up.

**Practitioner UI:** `/referrals` (`app/referrals/page.tsx` server shell → redirects non-approved to
`/dashboard`; `components/ReferralsApp.tsx`): invite link + copy button, "£X credited · N pending", and a
**4-stage stepper per referral** (horizontal on desktop, stacks vertically on mobile via `min-w-0` + `sm:` prefixes).
Nav item **"Refer & Earn"** in `SiteHeader.tsx PRACTITIONER_NAV` + a dashboard quick-link (`DashboardApp` `QUICK_LINKS`).
API `GET /api/me/referrals` → `{inviteLink, earnings:{creditedTotal,pendingCount}, referrals: ReferralView[]}`
(inviteLink = `${portalUrl()}/apply?ref=<affiliateCode>`).

**Admin:** read-only "Referrals" card in `AdminDashboard` (Insights and ops group, `Gift` icon) →
`components/AdminReferrals.tsx` (referrer, referee, status, bonus, date; `overflow-x-auto` table). API
`GET /api/admin/referrals` → `{referrals, totalCredited}`.

**Tests:** `tests/referrals-db.test.ts` (6), `tests/referral-award.test.ts` (4), `tests/referral-apply.test.ts` (4),
`tests/api-referrals.test.ts` (2), `tests/api-admin-referrals.test.ts` (2).

**New env:** `REFERRAL_BONUS_GBP` (optional, default 50 — works with nothing set). Add to Vercel only for a
different amount.

**Live E2E proof (done on prod 2026-08-03):** created Demo Referrer (id 14, code `WN-REFERR-G9QP`) → Demo
Referred (id 15) applied via that code → referral signed_up → Demo Referred paid a mock cart (£35.55, order
`cart-4`) → referral auto-advanced to **credited, £50** → admin shows "1 referrals · £50.00 credited". **These are
demo rows on PROD — see §14 for cleanup.**

---

## 10. MOBILE-RESPONSIVE PASS (2026-08-02, deployed `4b73f86`)

Presentational-only (no `lib/`/`api/`/auth/`db.ts` touched). Verified live.
- **Mobile hamburger nav** — new `components/HeaderNav.tsx` (client): desktop nav unchanged (`hidden md:flex`),
  mobile hamburger drop-down (`md:hidden`, auto-closes on route change via `usePathname`). `SiteHeader.tsx`
  (server) still computes audience-filtered nav items and passes them as props — no auth logic moved.
- **Patient Carts overflow fix** — `min-w-0` on the grid column + product-row flex items in `CartsApp.tsx`
  (CSS grid/flex items default to `min-width:auto`, which forced the page ~456px wide at 375px).
- **5 admin tables wrapped** in `overflow-x-auto` (grid-child tables also get `min-w-0`): `AdminDashboard`
  (Applications), `AdminCalendar`, `AdminLessons`, `AdminAiQueries`, `ChatInsights`. Tables scroll within their
  card instead of blowing out the viewport.
- **Dead code removed:** `/coming-soon` route + `ComingSoon.tsx` (orphan, nothing linked); stale untracked
  `data/practitioners.db`.
- **Mobile pattern for new UI:** wide content in a grid/flex item needs `min-w-0`; wide tables need an
  `overflow-x-auto` wrapper.

---

## 11. ENVIRONMENT VARIABLES

**Set in Vercel production (live):** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ADMIN_PASSWORD`
(**`wild-admin-2026`**), `SESSION_SECRET` (practitioner sessions + cert-upload HMAC), `PORTAL_URL` (the rose URL,
builds magic-link + invite + cert URLs), `COMMISSION_PERCENT` (=20, reporting + cart + referral display),
`GMAIL_USER` (=utkarshrawatofficial@gmail.com), `GMAIL_APP_PASSWORD`, `BLOB_READ_WRITE_TOKEN` (auto), `CRON_SECRET`,
`GEMINI_API_KEY` + `GEMINI_API_KEY2` (**both 429-exhausted**).

**Read by code, optional / currently UNSET (feature runs mock/degraded until set):**
- `REFERRAL_BONUS_GBP` — referral bonus £ (default **50**). NEW this session.
- `AFFILIATE_DISCOUNT_PERCENT` — patient discount % on Patient Carts (default **10**).
- `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN` — both present flips `commerceProvider()` to `'shopify'` AND
  (originally) enables real Shopify orders/revenue/tiers. Unset → mock catalog + mock pay + £0 real revenue.
- `SHOPIFY_WEBHOOK_SECRET` — HMAC for `/api/webhooks/shopify`. `STATS_SOURCE=shopify-live` switches
  dashboard/reporting to a live Shopify query.
- `GEMINI_MODEL` (default `gemini-2.0-flash`), `ANTHROPIC_API_KEY` (dormant AI fallback + `generate-lessons`),
  `EMAIL_FROM`, `RESEND_API_KEY`, `MAILCHIMP_API_KEY`, `MAILCHIMP_AUDIENCE_ID`, `ADMIN_ALERT_EMAIL`,
  `CHAT_ALERT_MINUTES` (default 5), `KB_DIR` (default `knowledge/`).
- `DB_PATH` — test/local file-DB path (set by tests + `.env.development.local`). Not a prod var.
- `VERCEL`, `AWS_LAMBDA_FUNCTION_NAME` — runtime-provided; do not set.

**Local `.env.local` gotcha:** contains `COMMISSION_PERCENT=""` (empty). Harmless (robust parser falls back), but
don't rely on local commission matching prod.

---

## 12. DEPLOY PROCESS

- **`npx vercel --prod --yes`** from the repo root. CLI authed as `utkarshrawatofficial-2811`, team
  `utkarsh-projects12`. **Check `vercel whoami` before claiming you can't deploy.**
- **Deploys the WHOLE working tree** (uncommitted changes ship), builds on Vercel, then aliases to
  `practitioner-portal-rose.vercel.app`. Migrations run idempotently on first prod DB connection.
- **Some sandboxes block the deploy command via an auto-classifier.** If blocked, the user runs it in their
  terminal. (It succeeded from here on 2026-08-03.)
- **Post-deploy verification (read-only):** probe `curl -s -o /dev/null -w "%{http_code}"` for routes — new
  routes returning their gated codes (401/307) instead of 404 proves the build landed. Public pages render clean.
- **Recommended hygiene:** commit only your changed files with a surgical `git add <files>` (never `git add -A`),
  since ~70 unrelated files are dirty. Work on a feature branch for isolation, fast-forward merge to `main`, deploy.

---

## 13. LOCAL DEV & TESTING

- **Launch configs** in ROOT `Wild Dash/.claude/launch.json` (port 3100): use **`portal-dev`** (`next dev`), NOT
  `portal` (`next start` = prod mode → would hit prod Turso).
- **`.env.development.local` (gitignored)** forces an isolated scratch **file DB** (`DB_PATH` in the session
  scratchpad), BLANKS `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` (so line ~199 falls through to the file DB),
  blanks `GMAIL_*` (so magic-link returns on-screen `devLink`), blanks `BLOB_READ_WRITE_TOKEN`, sets
  `ADMIN_PASSWORD=preview-admin`. **This is why dev never touches prod** — verify by an admin read returning `[]`.
- **Get a local practitioner session:** apply a qualified BANT applicant via `POST /api/apply` (auto-approves +
  sets session cookie in the response), OR `POST /api/auth/request-link` → open the returned `devLink` →
  session cookie set. Dismiss the welcome takeover via `POST /api/me/seen-welcome`.
- **Local admin cookie:** `wn_admin = SHA-256('preview-admin')`.
- **Tests:** `npm test` (79 files, 336 tests). Harness: `beforeEach` sets `process.env.DB_PATH` to a temp file;
  `afterEach` calls `(await import('@/lib/db')).resetDbForTests()`; raw SQL via `execForTests()` (returns
  `{rows, lastInsertRowid, rowsAffected}`). Seed helper pattern: `insertApplication(...)` + `markApproved(id,
  {affiliateCode, affiliateLink, pendingSync, decidedBy})`.
- **`npm run build` corrupts `.next` if a dev server is running** — stop the preview server first.
- **Browser-testing quirk:** the in-app browser's screenshot is ~2× the click coordinate space (DPR). Prefer
  clicking by `ref`, or drive SPA buttons via `javascript_tool` (`[...document.querySelectorAll('button')]
  .find(x=>/^Label/.test(x.textContent)).click()`). Detect real horizontal overflow with
  `document.documentElement.scrollWidth > document.documentElement.clientWidth` (NOT `innerWidth`).

---

## 14. KNOWN GAPS / STUBBED / FOLLOW-UPS

1. **Gemini 429 quota-exhausted (blocks 3 features)** — Ask the Expert, Content Factory, Chat FAQ clustering
   reach Google but 429 on both keys. Fix: enable billing/raise quota, add a key on another Google project, or
   set `ANTHROPIC_API_KEY` for the dormant Claude path. No code change.
2. **Real Shopify NOT connected** — tiers stay Standard, real revenue £0, Patient-Carts uses the mock catalog.
   Set `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` (+ `SHOPIFY_WEBHOOK_SECRET`) and implement the `shopify`
   branch of `getCatalog()`/`createDraftOrder()` in `lib/commerce/index.ts` (currently they return mock even when
   the provider is 'shopify' — a half-activated state to guard). Extend `/api/webhooks/shopify` to reconcile
   `patient_carts` by `external_id`.
3. **KB is 5 SAMPLE docs** (`knowledge/`) — replace with real WN dossiers.
4. **Chat missed-message email is DAILY** not 5-min (Vercel Hobby cron cap). In-app popup unaffected. Fix:
   Vercel Pro + change `vercel.json` cron `/api/cron/chat-alerts` to `*/5 * * * *`.
5. **Sentry / error monitoring NOT wired** — errors are `console.error` + `ai_queries`/`automation_runs` logs.
6. **Coming-soon stubs** remain in some copy (Book Technical Consultation, Student Mentoring, My Downloads).
   **Facebook Group URL is a PLACEHOLDER** (`FB_GROUP_URL` in `CommunityApp.tsx`).
7. **Referral v1** credits on any recorded order (not gated on `financialStatus`); no refund clawback; no
   multi-tier/chain; no email invites; no admin approval gate; no per-practitioner cap. All deferred by design.
8. **`CartsApp` swallows non-OK create responses** (no error surfaced). `PayPage money()` hardcodes `£`.
9. **No DB transactions anywhere** (codebase-wide convention) — e.g. `createPatientCart` inserts cart+items
   without a transaction. Fine for the demo scale.

---

## 15. TEST DATA ON PRODUCTION (clean before real launch)

The prod Turso DB (`libsql://utkarsh-utkarshraw123.aws-eu-west-1.turso.io`) holds test/demo rows. There is **no
delete-practitioner button** in the admin UI — remove via the **Turso web console** (the sandbox blocks prod DB
writes from here).
- **Referral demo (2026-08-03):** practitioner `Demo Referrer` (id 14, demo-referrer@example.com, code
  `WN-REFERR-G9QP`), `Demo Referred` (id 15, demo-referred@example.com), `practitioner_referrals` id 1 (credited
  £50), patient cart id 4 + order `cart-4` (£35.55, mock-paid).
- **Earlier sessions:** possible henrietta/lucy + assorted `*@example.com` test practitioners.

---

## 16. CRITICAL GOTCHAS (do not violate)

- **DB must be Turso in prod.** `lib/db.ts` throws (no `/tmp` fallback) on serverless without
  `TURSO_DATABASE_URL`, and wraps the client with `cache:'no-store'`. Don't reintroduce a `/tmp` fallback or
  default fetch caching.
- **Never reference `care@wildnutrition.com`** anywhere. Contact is `utkarshrawatofficial@gmail.com`.
- **Register verification is name-based** (no number/API lookup). Auto-approve only on qualified + high-confidence.
- **Deploys ship the whole working tree** — uncommitted files ship. Use surgical `git add`, never `git add -A`.
- **API routes** export `const dynamic = 'force-dynamic'`. Admin: `if(!isAuthed(req)) 401`. Practitioner:
  `getSessionPractitioner` + `status==='approved'`. Validate bodies with **zod** (try/catch `req.json()` → 400).
- **TDD** — failing test first; keep `npm test` green. **YAGNI / DRY / frequent surgical commits.**
- **Mobile:** `min-w-0` on wide grid/flex items; `overflow-x-auto` wrapper on wide tables.

---

## 17. SESSION HISTORY (chronological milestones)

- **…→2026-07-19** — Parts 1–8 built; Presence "Live Now"; card-based admin nav; admin logo→home; Patient Carts
  (mock commerce). See `PRACTSESSION_HANDOFF.md` for exhaustive per-feature detail. (Commit `f72f332` era.)
- **2026-08-02** (`4b73f86`, deployed) — Mobile-responsive pass (hamburger nav, Patient-Carts + 5 admin tables
  overflow fixes) + dead-code removal (`/coming-soon`, stale `data/practitioners.db`). 319 tests.
- **2026-08-03** (`ee09440`, deployed) — Practitioner-to-practitioner **Referral Network** (migration 017,
  automatic £50 award, `/referrals` page, admin view). 336 tests. Live E2E demo verified on prod.

---

## 18. READ-FIRST ORDER FOR A NEW SESSION

1. **THIS FILE** (`HANDOVER.md`) — the complete picture.
2. `CLAUDE.md` — terse conventions.
3. `lib/db.ts` (whole data layer) + `lib/migrations.ts` (001–017).
4. For the **referral network**: §9 here → `lib/db.ts` referral helpers + `recordOrder` hook →
   `lib/pipeline.ts` (attribution) → `app/api/{me,admin}/referrals/route.ts` → `components/{ReferralsApp,
   AdminReferrals}.tsx` → spec/plan in `docs/superpowers/{specs,plans}/2026-08-03-practitioner-referral-network*`.
5. For **onboarding/approval**: `lib/pipeline.ts` + `lib/decision.ts` + `lib/registers/*` + `lib/certUpload.ts`.
6. For **commerce/carts**: `lib/commerce/*` + `app/api/pay/[token]/route.ts` + `components/{CartsApp,PayPage}.tsx`.
7. For **auth**: `lib/{adminAuth,practitionerAuth,serverSession,magicLink,welcomeGate}.ts`.
8. Env + deploy facts in §11/§12 before touching prod. Cleanup list in §15 before real launch.

**Commands recap:** `npm run dev` (→ :3100, `portal-dev`), `npm test` (336), `npm run build` (stop dev first),
`npx vercel --prod --yes`. Admin prod pw `wild-admin-2026` / local `preview-admin`.
