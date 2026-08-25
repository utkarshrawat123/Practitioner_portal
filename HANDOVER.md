# Wild Nutrition Practitioner Hub — MASTER HANDOVER

**This is the single, self-contained, exhaustive entry point for a new session.** Read this first.
`CLAUDE.md` is the terse agent guide. `docs/CLOUDFLARE_DEV.md` covers running locally and
`docs/CLOUDFLARE_GO_LIVE.md` covers deploying. Last rewritten **2026-08-17**.

> **Starting a new session? Read `docs/NEXT_SESSION.md` FIRST** — current branch state, what the
> last session did, and where to pick up. Then `docs/DECK_GAP_ANALYSIS.md` (remaining features vs the
> design deck) and `docs/UI_REDESIGN.md` (the in-flight brand reskin).

> **Platform:** this app deploys to **Cloudflare Workers**. It is **not** on Vercel any more.
> Anything you read about Vercel, Turso or Vercel Blob is history — see §17.

- **Repo:** `https://github.com/utkarshrawat123/Practitioner_portal` — branch **`cloudflare-migration`**
  (the default; all work branches from it). Never touch `Utkarshraw123/practitioner-portal`, which is a
  separate personal portfolio repo.
- **State:** **468 tests pass · production build clean · runs fully in MOCK MODE with no API keys.**
- **Not deployed yet.** Go-live needs company Cloudflare account access — see §12.

---

## 0. TL;DR / QUICK START

```bash
npm install
npm test            # Vitest — 468 tests, keep green
npm run dev         # local dev → http://localhost:3100 (Node path, mock mode, no keys needed)
npm run preview:cf  # REAL Cloudflare runtime locally: workerd + local D1/R2 → http://localhost:8787
npm run build       # production build + type-check gate (stop the dev server first — it corrupts .next)
npm run bundle-kb   # re-bundle the AI knowledge base after ANY edit under knowledge/
```

- **What it is:** a Next.js 15 (App Router) practitioner community platform for Wild Nutrition —
  onboarding + register verification, a passwordless practitioner dashboard, an AI protocol assistant,
  education/lessons, media/resources, clinical toolkit, community + events, live chat + presence,
  patient carts (curated cart → pay link), a practitioner-to-practitioner referral network, and a
  password-gated admin console with reporting.
- **Single Next.js app on Cloudflare Workers** via OpenNext. **D1** database (libSQL-shaped adapter),
  **R2** file storage, **Resend** email, **Gemini** AI. Raw parameterised SQL, no ORM.
- **Every integration runs in mock/degraded mode without keys** and lights up when its key appears.
  This is a hard rule — never make a feature require a key to boot.

---

## 1. TECH STACK (verified 2026-08-17)

- **Next.js 15.5.23 App Router** on **Cloudflare Workers**, built by
  **`@opennextjs/cloudflare` 1.20.2**. Entry is **`worker.ts`** (per `wrangler.toml` `main`), which wraps
  OpenNext's generated `.open-next/worker.js` and adds a `scheduled()` handler for Cron Triggers.
- **Database = Cloudflare D1**, reached through a libSQL-shaped adapter behind `getClient()` in
  `lib/db.ts`. `lib/db/binding.ts` `getD1Binding()` returns the request context's `DB` binding, or null
  off-Workers. Off-Workers (dev, tests) the same code path uses **`@libsql/client`** against a local
  `file:` DB. Schema = base `SCHEMA` string + append-only `lib/migrations.ts` (**001–018**), applied
  idempotently on first connection — **the app self-migrates, there is no manual migration step.**
- **File storage = R2** via `lib/storage/index.ts`; binding `BUCKET` (`getR2Binding()`). Off-Workers it
  falls back to local disk under `data/uploads/`. Auth-gated reads go through `/api/files/[...key]`.
  Public media URLs are built from `R2_PUBLIC_BASE`.
- **Email = Resend** (`lib/providers/resend.ts`). Preference order in `lib/providers/email.ts`:
  **Resend → SMTP → mock**. `smtp.ts` lazy-loads `nodemailer` so it never bundles into the Worker.
- **AI = Google Gemini via raw REST fetch (no SDK).** `selectProvider()` in `lib/ai/assistant.ts` prefers
  Gemini (`GEMINI_API_KEY` → `GEMINI_API_KEY2`) and falls back to a dormant Anthropic path. Model
  `gemini-2.0-flash`. **Both Gemini keys are 429 quota-exhausted** → Ask the Expert, Content Factory and
  Chat FAQ clustering are dormant but degrade gracefully.
- **Knowledge base is BUNDLED.** Workers has no filesystem, so `lib/ai/kb.ts` reads `knowledge/*.md` from
  disk in Node and falls back to the build-time bundle `lib/ai/kb.bundle.json` on Workers. **If you edit
  anything under `knowledge/`, run `npm run bundle-kb` and commit the bundle** — see §16 and
  `docs/KB_AUTHORING.md`.
- **Commerce = a mock provider seam** (`lib/commerce/`). `commerceProvider()` returns `'shopify'` when
  `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` are set, else `'mock'`. The shopify branch IS implemented (catalog, draft orders, webhook cart reconciliation) — it activates the moment those two creds are set. **No store credentials yet.**
- **Cron = Cloudflare Cron Triggers.** `wrangler.toml [triggers]` declares the schedules;
  `lib/cron/map.ts` maps each cron expression to its internal route; `worker.ts scheduled()` calls it
  through the Worker's own fetch with `CRON_SECRET`. **Adding a schedule means editing BOTH files.**
- **UI:** Tailwind (brand tokens below), `lucide-react` icons, `framer-motion` (welcome takeover), `zod`
  validation, **Vitest** tests, `pdf-lib` for certificates. `better-sqlite3` is a local/test dep only.
- **Brand tokens:** `ink #191919`, `ink2`, `terracotta #a45248`, `cream #f8f6f3`, `sage #d0d1ab`,
  `stone #e6e3df`, `forest #3a4f41`; heading font Gestura (`font-heading`). Practitioner containers
  `mx-auto max-w-5xl px-6 py-10`; admin `max-w-7xl`.

---

## 2. REPO LAYOUT

```
app/                  Next.js routes (pages + api). See §4.
components/           React components (client + a few server). See §5.
lib/                  Domain logic + data layer (db.ts is the whole data layer). See §6.
knowledge/            AI knowledge base — 10 product dossiers + 2 clinical guides. See §15.
tests/                Vitest suites. Harness: temp DB_PATH + resetDbForTests() + execForTests().
docs/CLOUDFLARE_DEV.md       How to run locally (Node + the Cloudflare runtime).
docs/CLOUDFLARE_GO_LIVE.md   Deploy checklist for when account access lands.
docs/KB_AUTHORING.md         Knowledge-base contract, template and go-live gate.
docs/NEXT_SESSION.md         START HERE in a new session — state + next steps.
docs/DECK_GAP_ANALYSIS.md    Design-deck features vs what is built (remaining-work map).
docs/UI_REDESIGN.md          Brand design system + reskin progress.
docs/superpowers/{specs,plans}/  Dated design specs + implementation plans, one per feature (history).
worker.ts             Cloudflare Worker entry (wraps OpenNext + adds scheduled()).
wrangler.toml         Bindings (D1 `DB`, R2 `BUCKET`), cron triggers, vars.
open-next.config.ts   OpenNext adapter config.
scripts/bundle-kb.mjs Bundles knowledge/ into lib/ai/kb.bundle.json.
CLAUDE.md             Terse agent guide.
HANDOVER.md           THIS FILE — master handover.
PRACTSESSION_HANDOFF.md / PROJECT_HANDOFF.md   HISTORICAL logs (pre-Cloudflare). See §17.
```

---

## 3. COMPLETE FEATURE INVENTORY

Parts 1–8 + Presence + Patient Carts + Mobile pass + Referral Network are all **built**.

1. **Onboarding + register verification** — `/apply` (`ApplyForm`) → `POST /api/apply` → `lib/pipeline.ts`
   `processApplication`. Name-based register verification (`lib/registers/*` — registers expose no
   number/API lookup). Auto-approve only on qualified + high-confidence match, else **flagged**.
   Approved-on-apply practitioners are **auto-logged-in**. Decision logic in `lib/decision.ts`.
   Register bodies: BANT, CNHC, NNA, ANP.
2. **Student certification** — a **student** applicant is flagged (`STUDENT_MANUAL`) AND emailed a secure,
   self-expiring upload link (`lib/certUpload.ts`, HMAC `cert:`-prefixed token — never a login session).
   They upload proof at `/upload-certification?token=…` → `POST /api/certification` → **R2** under
   `certifications/` (migration `014`). Admin Flagged detail shows a "Student certification" block.
3. **Practitioner dashboard** — `/dashboard` (server shell → redirects first-login to
   `/onboarding/welcome`, else renders `DashboardApp`). Referral/affiliate stats via `lib/stats.ts`
   `computeStats`, continue-learning, quick links, referral earnings.
4. **Welcome takeover** — `/onboarding/welcome` (`WelcomeExperience`, framer-motion cinematic scroll).
   Plays on **every login** via the per-login `wn_welcome` cookie (`lib/welcomeGate.ts`), dismissed by
   `POST /api/me/seen-welcome`. Fonts Fraunces/Inter scoped to this route only.
5. **Ask the Expert (AI)** — `/assistant` → `POST /api/assistant` → `lib/ai/*` (KB in `lib/ai/kb.ts`,
   safety in `lib/ai/safety.ts`, assistant in `lib/ai/assistant.ts`). Cites all supporting KB docs and
   drops fabricated citations. **Dormant on Gemini 429.** Rate-limited via `ai_queries` (30/practitioner/hour).
6. **Learning / Pathways** — `/learning` + `/learning/[id]`, CPD hours, module completions, certificates
   (`lib/certificates.ts`). `/cpd` tracks CPD.
7. **Lessons / Library** — `/library` education lessons + completions. Offline generation
   `npm run generate-lessons` (needs `ANTHROPIC_API_KEY`).
8. **Media / Resources** — `/resources` media library; admin uploads to **R2** + thumbnails
   (`lib/media/thumbnail.ts`).
9. **Clinical Toolkit** — `/toolkit` handouts/protocols/decision-trees/recipes/faqs/email-templates.
10. **Clinical Pearls** — admin-curated surfaced content (migration `012`).
11. **Community** — `/community` posts/replies/upvotes (migration `010`). **Facebook Group URL is a
    PLACEHOLDER** (`FB_GROUP_URL` in `CommunityApp.tsx`).
12. **Events** — `/events` hub events + registrations, ICS export (`lib/events/ics.ts`).
13. **Leaderboard** — `/leaderboard` opt-in leaderboard (migration `006`).
14. **Automation** — scheduled jobs (migration `011`, `lib/automation/*`) — tiering, lifecycle,
    engagement emails. Cron endpoints under `/api/cron/*` guarded by `CRON_SECRET`.
15. **Live Chat** — fast-polling (~2.5s) practitioner↔admin support chat (`ChatWidget` via `ChatGate`;
    admin side `AdminChat`). Migration `013`. Email backstop `cron/chat-alerts`. Insights/FAQ clustering
    `ChatInsights` (degrades on 429).
16. **Presence "Live Now"** — `PresenceBeat` → `POST /api/me/presence` every 30s while the tab is focused
    → `practitioners.last_seen_at` (migration `015`). Online = seen within `PRESENCE_WINDOW_SECONDS` (90).
    Admin "Online now (N)" strip + dots in `AdminChat`; admin-initiated chat via `POST /api/admin/chat`.
17. **Patient Carts** — practitioner builds a cart → tokenised login-free pay link → patient pays on a
    branded **mock** checkout → sale attributed via `recordOrder` → shows in dashboard/Reporting.
    `/carts` (`CartsApp`), `/pay/[token]` (`PayPage`, chrome hidden via `ChromeGate`). Provider seam
    `lib/commerce/`, migration `016`. 10% patient discount, 20% commission. **Mock catalog = 8 real WN
    products** with real `cdn.shopify.com` images (`lib/commerce/catalog.mock.ts`).
18. **Admin console** — `/admin` (`AdminDashboard`), a card home of grouped section cards. **16 sections:**
    Applications · Lessons · Media · Pathways · Toolkit · Homepage · Factory · Pearls · Calendar ·
    Community · Events · Live Chat · AI queries · Reporting · Referrals · Automation.
19. **Mobile-responsive pass** — hamburger nav (`HeaderNav`), Patient-Carts overflow fix, 5 admin tables
    wrapped in `overflow-x-auto`. **Pattern for new UI:** `min-w-0` on wide grid/flex items;
    `overflow-x-auto` wrapper on wide tables.
20. **Practitioner-to-practitioner Referral Network** — see §9.

---

## 4. ROUTES

**Pages:** `/` (→ `/apply`), `/apply`, `/dashboard`, `/onboarding/welcome`, `/assistant`, `/learning`,
`/learning/[id]`, `/library`, `/resources`, `/toolkit`, `/community`, `/events`, `/leaderboard`, `/cpd`,
`/carts`, `/pay/[token]`, `/referrals`, `/upload-certification`, `/admin`.

**Practitioner/public APIs:** `/api/apply`, `/api/me` (+ `/me/stats`, `/me/widgets`, `/me/seen-welcome`,
`/me/presence`, `/me/catalog`, `/me/carts` (+`/[id]/send`), `/me/chat`, `/me/cpd`, `/me/community`
(+`/[id]`, `/reply`, `/upvote`), `/me/events` (+`/[id]/register`), `/me/pathways` (+`/[id]`, `/complete`),
`/me/pearls`, `/me/leaderboard`, `/me/toolkit`, `/me/referrals`), `/api/auth/{request-link,verify,logout}`,
`/api/library` (+`/[id]/complete`), `/api/resources`, `/api/assistant`, `/api/certification`,
`/api/pay/[token]`, `/api/r/[code]` (referral click → redirect), **`/api/files/[...key]`** (auth-gated R2
reads), `/api/webhooks/shopify`, `/api/cron/{heartbeat,run,chat-alerts}`.

**Admin APIs (all `isAuthed`-gated):** `/api/admin/{login,logout,practitioners (+/[id]),ai-queries,lessons
(+/[id]),reporting (+/export),media (+/[id],/upload,/thumbnail,/cleanup),widgets (+/[id]),pathways (+/[id],
/modules,/content),toolkit (+/[id]),events (+/[id]),community (+/[id]),pearls (+/[id]),factory,automation
(+/run),calendar,presence,chat (+/[id],/close,/insights,/insights/faqs),referrals}`.

---

## 5. COMPONENTS

**Chrome:** `SiteHeader` (server, context-aware nav), `HeaderNav` (client, desktop nav + mobile hamburger),
`LogoutButton`, `ChromeGate` (hides header/footer on `/onboarding/*`, `/pay`), `ChatGate`, `PresenceBeat`,
`AdminLogoLink`.
**Practitioner apps:** `ApplyForm`, `DashboardApp`, `WelcomeExperience`, `AssistantApp`,
`LearningCatalogue`, `PathwayDetail`, `LibraryApp`, `ResourcesApp`, `MediaCard`, `ToolkitApp`,
`CommunityApp`, `EventsApp`, `LeaderboardApp`, `CpdApp`, `CartsApp`, `PayPage`, `ChatWidget`,
`ReferralsApp`, `CertificationUpload`.
**Admin:** `AdminDashboard` (+ `AdminAiQueries`, `AdminAutomation`, `AdminCalendar`, `AdminChat`,
`AdminCommunity`, `AdminEvents`, `AdminFactory`, `AdminLessons`, `AdminMedia`, `AdminPathways`,
`AdminPearls`, `AdminReferrals`, `AdminReporting`, `AdminToolkit`, `AdminWidgets`, `ChatInsights`).

---

## 6. DATA LAYER + LIB

- **`lib/db.ts`** — the ENTIRE data layer, all `async`, private `run`/`one`/`all`/`num` helpers +
  `rowToPractitioner`/`rowToReferral` mappers. `SCHEMA` exported for tests. **Connection selection in
  `rawClient()`:** the **D1 binding wins** (taken before `dbUrl()` so `@libsql/client` is never
  referenced on the Worker); otherwise `@libsql/client` is imported dynamically against `dbUrl()`.
  `resetDbForTests()` + `execForTests()` for tests.
- **`lib/db/binding.ts`** — `getD1Binding()` / `getR2Binding()`. Lazily requires
  `@opennextjs/cloudflare` behind try/catch so Node builds and Vitest get `null` instead of an error.
- **`lib/migrations.ts`** — append-only `{id, sql}[]`, `001_orders` … `017_practitioner_referrals`.
  `runMigrations(client)` applies each once, tracked in `schema_migrations`.
- **`lib/storage/index.ts`** — R2 put/get/delete with a local-disk fallback off-Workers.
- **Domain libs:** `pipeline.ts` (application processing + referral attribution), `decision.ts`,
  `registers/*`, `codes.ts` (`portalUrl`, `referralLink`, `generateCode`), `access.ts` (`hasAccess`),
  `stats.ts`, `reporting/*`, `ai/*`, `lessons/*`, `automation/*`, `chat/*`, `commerce/*`, `events/*`,
  `media/*`, `cron/map.ts`, `certUpload.ts`, `certificates.ts`, `magicLink.ts`, `welcomeGate.ts`,
  `serverSession.ts`, `presence/config.ts`, `providers/*`, `uploadClient.ts`, `emails/templates.ts`.
- **Auth libs:** `adminAuth.ts` (`isAuthed(req)`), `practitionerAuth.ts` (`getSessionPractitioner(req)`,
  `sessionCookieHeader(id)`), `serverSession.ts` (`getServerSessionPractitioner()`).

---

## 7. DB SCHEMA (base + migrations 001–018)

**Base tables (`SCHEMA` in `lib/db.ts`):**
- `practitioners(id PK, name, email UNIQUE, register_body, register_number, qualification_status,
  tier DEFAULT 'standard', status DEFAULT 'pending', verification_json, affiliate_code UNIQUE,
  affiliate_link, pending_sync DEFAULT 0, created_at, decided_at, decided_by,` **+008**
  `has_seen_welcome,` **+014** `certification_url/pathname/filename/uploaded_at,` **+015** `last_seen_at)`
- `events(id PK, practitioner_id, type, detail, created_at)` — audit trail (NOT the events hub).
- `auth_tokens(token PK, practitioner_id, expires_at, used_at)` — magic-link tokens.
- `clicks(id PK, practitioner_id, code, created_at)` — referral click log.
- `ai_queries(...)` — Ask-the-Expert log + rate-limit source.
- `lessons(...)`, `lesson_completions(... UNIQUE(practitioner_id, lesson_id))`, `login_events(...)`,
  `media(...)`.

**Migrations:**
- **001** `orders(id PK, order_id UNIQUE, practitioner_id, code, total REAL, currency DEFAULT 'GBP',
  financial_status, created_at, received_at)`. **Shopify order revenue, Patient-Carts mock-pay AND
  referral qualifying sales all write here** (`recordOrder`, ON CONFLICT upsert).
- **002** `pathways`, `pathway_modules` — **009** adds `category`, `cpd_hours`, `module_completions`.
- **003** `certificates(... UNIQUE(practitioner_id, pathway_id))`.
- **004** `toolkit_resources` — type ∈ handout|protocol|decision_tree|recipe|faq|email_template.
- **005** `hub_events`, `hub_event_registrations` — **010** adds `event_type`, `capacity`.
- **006** `tier_history`, `leaderboard_optins`.
- **007** `homepage_widgets`. **008** `has_seen_welcome`.
- **010** `community_posts`, `community_replies`, `community_upvotes`.
- **011** `email_log(... UNIQUE(practitioner_id, job, period))`, `automation_runs`.
- **012** `clinical_pearls`. **013** `chat_conversations`, `chat_messages` (sender ∈ practitioner|admin).
- **014** certification columns. **015** `last_seen_at`.
- **016** `patient_carts(... token UNIQUE, status DEFAULT 'draft', provider DEFAULT 'mock', external_id,
  pay_url, ...)` + `patient_cart_items`. status ∈ draft|sent|paid.
- **017** `practitioner_referrals(... referrer_id, referred_id, invite_code, status DEFAULT 'invited',
  qualifying_order_id, bonus_amount, ...)` + **UNIQUE(referred_id)**.
  status ∈ invited|signed_up|first_sale|completed|credited.
- Bookkeeping: `schema_migrations(id PK, applied_at)`.

`audience` (all|qualified|student) on content tables gates via `lib/access.ts hasAccess()`.

---

## 8. AUTH MODEL

- **Admin** — `lib/adminAuth.ts`. Cookie `wn_admin` = `SHA-256(ADMIN_PASSWORD)` hex, 12h. `isAuthed(req)`
  checks it. Login `POST /api/admin/login`.
- **Practitioner** — `lib/practitionerAuth.ts`. HMAC-signed `wn_session` cookie (30d) via `SESSION_SECRET`.
  `getSessionPractitioner(req)` verifies + loads; require `status === 'approved'`. Server components use
  `lib/serverSession.ts`. Approved-on-apply sets the cookie directly (auto-login).
- **Magic links** — `lib/magicLink.ts`, 15-min tokens in `auth_tokens`. `POST /api/auth/request-link`
  emails a link; **with no email provider configured it returns an on-screen `devLink` instead** —
  which is exactly how you get a local session. `GET /api/auth/verify?token=…` sets the cookie.
- **Certification upload tokens** — `lib/certUpload.ts`, HMAC `cert:`-prefixed, never a login session.
- **Welcome gate** — per-login cookie `wn_welcome`, separate from the permanent `has_seen_welcome` column.

---

## 9. THE REFERRAL NETWORK — full detail

**An approved practitioner invites a colleague via a unique link and earns £50 (in-app, tracked)
automatically when that colleague makes their first paid sale.** Spec/plan:
`docs/superpowers/{specs,plans}/2026-08-03-practitioner-referral-network*`.

**Locked decisions:** invite link (`/apply?ref=<affiliateCode>`) + optional manual code box;
**automatic** award on first paid sale (no admin approval); tracked **in-app** (no real payout).

| UI label | status | set when |
|---|---|---|
| Signed up | `signed_up` | referee applies via the link AND is approved |
| First purchase completed | `first_sale` | referee's first qualifying order recorded |
| Referral completed | `completed` | referral qualifies (same txn as first_sale), **or qualifies but is blocked by the per-referrer cap** |
| — (admin queue) | `awaiting_approval` | qualified while `REFERRAL_REQUIRE_APPROVAL=true` — held for admin sign-off |
| Added to earnings | `credited` | £50 stamped on the row |
| Refunded — reversed | `clawed_back` | the qualifying order was refunded/voided. **Terminal**: later sales do not re-credit |

**v2 award rules** (`maybeAwardReferralBonus(referredId, orderId, financialStatus)`):
credit requires `financialStatus === 'paid'` (real Shopify fires `orders/create` for pending/unpaid
orders — v1 would have paid out on those); the per-referrer cap sends the referral to `completed`
uncredited; `REFERRAL_REQUIRE_APPROVAL` sends it to `awaiting_approval` for
`POST /api/admin/referrals/[id]/approve`. `recordOrder()` routes refunded/voided/partially-refunded
statuses to `clawbackReferral(orderId)` instead, keyed on the order id so unrelated refunds are inert.

Internal-only `invited` = referee applied but not yet approved. On the automatic path
`first_sale → completed → credited` happen in one transaction.

**`lib/db.ts` helpers:** `createReferral`, `getReferralByReferredId`, `markReferralSignedUp`,
`listReferralsByReferrer` (→ `ReferralView`), `referralEarnings`, `listAllReferrals`, `creditReferral`,
`maybeAwardReferralBonus(referredPractitionerId, orderId)`, `referralBonusGbp()` (env
`REFERRAL_BONUS_GBP`, default 50).

**Award engine:** `recordOrder(o)` calls `maybeAwardReferralBonus(...)` at its END — a **single
choke-point** covering the Patient-Carts pay API and the Shopify webhook. Idempotent via
`status != 'credited'` + `UNIQUE(referred_id)`. **v1 credits on ANY recorded order** for a referred
practitioner; if real Shopify later sends unpaid/pending orders, gate on `financialStatus === 'paid'`.

**Attribution:** `ApplyForm.tsx` reads `?ref=` from `window.location` (deliberately NOT
`useSearchParams`, to avoid a Suspense boundary at build) into an optional `referredByCode` field.
`lib/pipeline.ts` resolves it via `findByCode` and guards self-referral / unapproved referrer — never
blocks signup. `approvePractitioner` calls `markReferralSignedUp(id)`.

**UI:** `/referrals` (`ReferralsApp`) — invite link + copy, "£X credited · N pending", 4-stage stepper per
referral. Nav item "Refer & Earn". Admin read-only "Referrals" card (`AdminReferrals`).

**Tests:** `referrals-db` (6), `referral-award` (4), `referral-apply` (4), `api-referrals` (2),
`api-admin-referrals` (2).

---

## 10. LOCAL DEV & TESTING

Full detail in **`docs/CLOUDFLARE_DEV.md`**. Two ways to run:

| Command | Runtime | Bindings |
|---|---|---|
| `npm run dev` | Node (Next dev, port 3100) | **real local D1 + R2** via `initOpenNextCloudflareForDev()` in next.config.mjs; email mock. Shares .wrangler/state with preview:cf. **The everyday loop.** |
| `npm run preview:cf` | Cloudflare Workers (Wrangler, port 8787) | local **D1** + **R2** emulation. Exercises the real Cloudflare code paths. No account needed. |

- **`npm run preview:cf` is the gate that catches D1-specific bugs.** Unit tests run on the libSQL/file
  path and will NOT catch them — one bug slipped past every unit test during the migration and was only
  caught here. Run it for anything touching DB, storage, cron or routes.
- Reset local D1/R2 state by deleting `.wrangler/state/`.
- **Get a local practitioner session:** apply a qualified BANT applicant via `POST /api/apply`
  (auto-approves + sets the session cookie), OR `POST /api/auth/request-link` → open the returned
  `devLink`. Dismiss the welcome takeover via `POST /api/me/seen-welcome`.
- **Tests:** `npm test` — 468 tests. Harness: `beforeEach` sets `process.env.DB_PATH` to a temp file;
  `afterEach` calls `resetDbForTests()`; raw SQL via `execForTests()`.
- **`npm run build` corrupts `.next` if a dev server is running** — stop it first.
- **Windows note:** `npm run preview:cf` works on Windows, but only because of the
  `outputFileTracingIncludes` block in `next.config.mjs` — do not remove it. Next's output tracing follows
  only the `node` export condition, so the workerd-condition files of the `@libsql` family
  (`lib-{esm,cjs}/web.js`, hrana-client `*/proto.js`) are never traced; on Windows OpenNext materialises
  the server-function `node_modules` from those traces and its workerd-condition esbuild pass then failed
  with `Could not resolve "@libsql/client"` (×97). Forcing the family into the trace completes the copy.
  (OpenNext still prints a "not fully compatible with Windows" warning — benign here.)

---

## 11. ENVIRONMENT VARIABLES

Nothing below is required to run locally — **the app boots and is fully exercisable with no keys.**

**Cloudflare bindings (`wrangler.toml`):** D1 `DB`, R2 `BUCKET`, assets `ASSETS`.

**Secrets to set at go-live** (`wrangler secret put` or the dashboard — see
`docs/CLOUDFLARE_GO_LIVE.md`): `RESEND_API_KEY`, `EMAIL_FROM`, `GEMINI_API_KEY`, `GEMINI_API_KEY2`,
`ANTHROPIC_API_KEY` (optional), `ADMIN_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`, `R2_PUBLIC_BASE`,
`PORTAL_URL`.

**Read by code, optional (feature runs mock/degraded until set):**
- `REFERRAL_BONUS_GBP` — referral bonus £ (default **50**).
- `REFERRAL_MAX_PER_REFERRER` — max referrals one practitioner may be **credited** for
  (default **unlimited**). Beyond the cap a referral still reaches `completed` but is never paid out.
- `REFERRAL_REQUIRE_APPROVAL` — `'true'` holds every qualifying referral at `awaiting_approval`
  for admin sign-off instead of auto-crediting (default **off** = v1 behaviour).
- `AFFILIATE_DISCOUNT_PERCENT` — patient discount % on Patient Carts (default **10**).
- `COMMISSION_PERCENT` — commission % (=20; set in `[vars]`).
- `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN` — both present flips `commerceProvider()` to `'shopify'`.
  Unset → mock catalog + mock pay + £0 real revenue.
- `SHOPIFY_WEBHOOK_SECRET` — HMAC for `/api/webhooks/shopify`. `STATS_SOURCE=shopify-live` switches
  dashboard/reporting to a live Shopify query.
- `GEMINI_MODEL` (default `gemini-2.0-flash`), `PRESENCE_WINDOW_SECONDS` (90), `CHAT_ALERT_MINUTES` (5),
  `ADMIN_ALERT_EMAIL`, `KB_DIR` (default `knowledge/`).
- `DB_PATH` — test/local file-DB path. Not a production var.

**No longer used (removed with the Vercel platform):** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
`BLOB_READ_WRITE_TOKEN`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, all `VERCEL_*`.

---

## 12. DEPLOY

Full checklist: **`docs/CLOUDFLARE_GO_LIVE.md`**. Summary — ~30 minutes once company Cloudflare access
lands, and **no code changes are needed**:

1. Create the **D1 database** (`practitioner-portal`) and **R2 bucket** (`practitioner-portal-media`,
   public access) in the Cloudflare dashboard.
2. Put the real D1 `database_id` into `wrangler.toml` (replaces `PLACEHOLDER_D1_ID`).
3. Set the secrets from §11.
4. Connect the repo for **git-based deploys**: Workers & Pages → Create → Workers → Connect to Git.
   Build `npx opennextjs-cloudflare build`, deploy `npx wrangler deploy`. Nothing to install locally.
5. **Schema self-migrates on the first request.** Cron triggers activate on deploy.

Then smoke-test: apply → appears in `/admin`; admin login; media upload lands in R2 and renders;
certification link 401s unless admin-authed; a magic-link email sends via Resend.

---

## 13. KNOWN GAPS / FOLLOW-UPS

**All feature code is built and merged.** Everything below is either waiting on someone else, or a
deliberate non-goal. Check live status any time with `GET /api/admin/readiness` (§12).

### Waiting on credentials or people — no code required

1. **Go-live secrets not set** — the app runs entirely in mock mode. Follow `docs/CLOUDFLARE_GO_LIVE.md`;
   ~30 minutes, config only. Until then: no D1/R2 bindings, email returns on-screen `devLink`s, AI is
   dormant, commerce uses the mock catalog.
2. **KB is 12 unapproved draft dossiers** (`knowledge/`) — structurally valid and gated, but awaiting
   Wild Nutrition clinical sign-off. `docsAwaitingClinicalApproval()` must be empty before the assistant
   is used with real practitioners. See §15 and `docs/KB_AUTHORING.md`.
3. **Gemini 429 quota-exhausted** — Ask the Expert, Content Factory and Chat FAQ clustering reach Google
   but 429 on both keys. Fix: enable billing / raise quota / add a key on another project, or set
   `ANTHROPIC_API_KEY` for the Claude path. **Config only.**
4. **Shopify paths are unit-tested, not store-tested** — `getCatalog()`/`createDraftOrder()` are covered
   with stubbed fetch. First thing to do once any store exists (a **Shopify partner dev store is free and
   self-serve**): create one real draft order and pay it, confirming `wn_cart_token` round-trips through
   `note_attributes` into cart reconciliation.
5. **Real-device mobile pass** — only spot-checked at 375px in dev. Do a pass on real handsets before
   launch (`LAUNCH_CHECKLIST.md` §5).
6. **`FB_GROUP_URL` is a placeholder** (`CommunityApp.tsx`) — override with `NEXT_PUBLIC_FB_GROUP_URL`
   once the business supplies the real group URL. No code change.

### Deliberate non-goals — decide before building

7. **Referral email invites.** The invite *link* flow already covers the use case. Emailing a colleague
   because a practitioner typed their address is a consent/GDPR decision for the business, not a default.
   Everything else in Referral v2 is built (§9).
8. **No DB transactions anywhere** (codebase-wide convention) — e.g. `createPatientCart` inserts cart +
   items without one. Fine at current scale; revisit if volume grows.

### Done — recorded so nobody "re-fixes" them

- **Shopify connect** — `shopify` branch of `getCatalog()`/`createDraftOrder()` implemented; cart
  reconciliation by `wn_cart_token`; failures surface as a 502 rather than a dead mock pay link.
- **Referral v2** — paid-only credit, refund clawback, per-referrer cap, optional admin approval (§9).
- **Polish** — `CartsApp` surfaces create errors; all money renders through `lib/format.ts formatMoney()`
  (no hardcoded `£`); the coming-soon quick-link stubs are gone.
- **Chat alerts** — `*/5 * * * *`, in both `wrangler.toml` and `lib/cron/map.ts`.
- **Error monitoring** — `lib/monitoring.ts` Sentry seam, wired into `worker.ts` fetch + scheduled;
  no-ops until `SENTRY_DSN` is set.
- **Missing-D1 guard** — a missing binding on Workers now throws a message naming the fix, instead of
  falling through to a filesystem that does not exist. (Replaced the dead `process.env.VERCEL` check.)

---

## 14. CRITICAL GOTCHAS (do not violate)

- **Mock-until-keyed is sacred.** Every integration must run with no secrets and light up when its key
  appears. Never make a feature hard-require a key to boot.
- **Edited `knowledge/`? Run `npm run bundle-kb` and commit `lib/ai/kb.bundle.json`.** Workers has no
  filesystem and reads only the bundle, so a stale bundle serves outdated clinical content in production
  while `npm run dev` looks correct. `tests/kb-sync.test.ts` catches this.
- **`preview:cf` is a required gate** for anything touching D1, R2, cron or routes. Unit tests use the
  libSQL/file path and will not catch D1-specific bugs.
- **Adding a cron schedule means editing BOTH `wrangler.toml [triggers]` and `lib/cron/map.ts`.**
- **Never reference `care@wildnutrition.com`** anywhere. Contact is `utkarshrawatofficial@gmail.com`.
- **Register verification is name-based** (no number/API lookup). Auto-approve only on qualified +
  high-confidence.
- **API routes** export `const dynamic = 'force-dynamic'`. Admin: `if(!isAuthed(req)) 401`. Practitioner:
  `getSessionPractitioner` + `status==='approved'`. Validate bodies with **zod** (try/catch
  `req.json()` → 400).
- **TDD** — failing test first; keep `npm test` green at every commit. Two gates before "done":
  `npm test` and `npm run build`. YAGNI / DRY / small surgical commits.
- **Mobile:** `min-w-0` on wide grid/flex items; `overflow-x-auto` wrapper on wide tables.

---

## 15. KNOWLEDGE BASE (§16 pointer)

See **`docs/KB_AUTHORING.md`** for the authoritative contract. In short:

- `knowledge/products/*.md` are product dossiers (`isProduct: true`); `knowledge/*.md` are clinical
  guides. **Only those two levels are read** — deeper subdirectories are silently ignored.
- Product dossiers **require** four non-empty sections: `## Key ingredients`, `## Label dosing`,
  `## Mechanism & evidence notes`, `## Cautions & interactions`. Each backs a specific `SYSTEM_RULES`
  instruction (dosing is quoted **verbatim**; claims may come only from the dossiers).
- Every document carries a **positive review marker**:
  `> **Clinical review:** AWAITING APPROVAL | APPROVED <date> — <who>`. A missing marker fails
  validation, so content cannot become silently unapproved.
- **Go-live gate:** `docsAwaitingClinicalApproval()` must be empty before the assistant is used with real
  practitioners. All 7 documents are currently AWAITING APPROVAL.
- The assistant sends the **entire** KB with every query (no retrieval), so size is per-query token cost.
  `KB_SIZE_WARN_CHARS` (300k) is both the loader warning and a test assertion.

---

## 16. TEST DATA / PRODUCTION HYGIENE

There is no live deployment yet, so there is no production data to clean. The old Turso database from the
Vercel era is out of the picture. When the Cloudflare D1 database is created it starts **empty** and
self-migrates — so launch from a clean slate and avoid creating demo practitioners on it.

If demo rows are needed for a presentation, create them, note them here, and delete them afterwards
(there is still **no delete-practitioner button** in the admin UI — use `wrangler d1 execute`).

---

## 17. HISTORY — and which docs to trust

This app was originally built on **Vercel + Turso + Vercel Blob + Gmail SMTP** and was re-platformed onto
Cloudflare in the **2026-08-17** migration (Next 14 → 15, Turso → D1, Vercel Blob → R2, Gmail SMTP →
Resend, Vercel Cron → Cloudflare Cron Triggers, KB bundled for a filesystem-less runtime).

**Trust these (current):** this file, `CLAUDE.md`, `docs/CLOUDFLARE_DEV.md`,
`docs/CLOUDFLARE_GO_LIVE.md`, `docs/KB_AUTHORING.md`, `wrangler.toml`, `worker.ts`.

**Treat as history (pre-Cloudflare, deliberately not rewritten):** `PRACTSESSION_HANDOFF.md`,
`PROJECT_HANDOFF.md`, `LAUNCH_CHECKLIST.md` items about Vercel, and everything under
`docs/superpowers/{specs,plans}/`. They are dated records of what was true when written — useful for
*why* a decision was made, misleading about *how the app runs today*. The migration's own spec and plan
(`docs/superpowers/*/2026-08-17-cloudflare-migration*`) are the exception: they describe the current
architecture.

**Milestones:**
- **…→2026-07-19** — Parts 1–8; Presence; card-based admin nav; Patient Carts (mock commerce).
- **2026-08-02** — mobile-responsive pass + dead-code removal. 319 tests.
- **2026-08-03** — Practitioner Referral Network (migration 017, automatic £50 award). 336 tests.
- **2026-08-17** — **Cloudflare migration** (Workers/D1/R2/Resend/Cron, KB bundling). 359 tests.

---

## 18. READ-FIRST ORDER FOR A NEW SESSION

0. **`docs/NEXT_SESSION.md`** — where the last session stopped, and the open decisions.
1. **THIS FILE** — the complete picture.
2. `CLAUDE.md` — terse conventions + architecture map.
3. `docs/CLOUDFLARE_DEV.md` — how to run it; `docs/CLOUDFLARE_GO_LIVE.md` — how to ship it.
4. `lib/db.ts` (whole data layer) + `lib/migrations.ts` (001–018) + `lib/db/binding.ts` (D1/R2 bindings).
5. For **commerce/carts** (the biggest gap): `lib/commerce/*` + `app/api/pay/[token]/route.ts` +
   `components/{CartsApp,PayPage}.tsx`.
6. For the **AI assistant / KB**: `docs/KB_AUTHORING.md` → `lib/ai/{kb,kbValidate,assistant,safety}.ts`.
7. For **onboarding/approval**: `lib/pipeline.ts` + `lib/decision.ts` + `lib/registers/*`.
8. For **auth**: `lib/{adminAuth,practitionerAuth,serverSession,magicLink,welcomeGate}.ts`.
9. For **cron**: `wrangler.toml [triggers]` + `lib/cron/map.ts` + `worker.ts`.
