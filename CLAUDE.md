# CLAUDE.md — Wild Nutrition Practitioner Hub

Agent-facing guide to this repo. **For the complete, self-contained master handover, read `HANDOVER.md` first.**
For a fuller narrative history see `PROJECT_HANDOFF.md`; per-session detail in `PRACTSESSION_HANDOFF.md`.
Detailed specs/plans live in `docs/superpowers/{specs,plans}/`.

## What this is
A Next.js 14 (App Router) practitioner community platform for Wild Nutrition: onboarding +
register verification, a passwordless practitioner dashboard, an AI protocol assistant, an
education/lessons library, a media/resources library, and a password-gated admin console with a
reporting layer. Single Next.js app deployed to Vercel.

## Commands
```bash
npm run dev                 # local dev, http://localhost:3100 (use this for previews)
npm test                    # Vitest — currently 231 tests, keep green
npm run build               # production build (also the type-check gate)
npm run generate-lessons    # offline lesson pipeline (needs ANTHROPIC_API_KEY)
npx vercel --prod --yes     # deploy to production (CLI already authed)
```
Live prod: https://practitioner-portal-rose.vercel.app · Admin: `/admin`, password = `ADMIN_PASSWORD`.

## Architecture map
- **Pages:** `app/{apply,dashboard,assistant,library,resources,admin}/page.tsx`; `app/page.tsx` → redirects to `/apply`. **Part 2:** `app/onboarding/welcome/page.tsx` (cinematic first-login takeover) and coming-soon stub routes `app/{learning,toolkit,community,events,coming-soon}/page.tsx` (Parts 3–5 replace these bodies). `app/dashboard/page.tsx` is a **server** shell that reads the session and redirects first-timers to `/onboarding/welcome`, else renders the client `DashboardApp` (which owns the logged-out login screen).
- **Public/practitioner APIs:** `app/api/{apply,me,me/stats,me/widgets,me/seen-welcome,resources,library,library/[id]/complete,assistant}`, `app/api/auth/{request-link,verify,logout}`, `app/r/[code]` (referral click → redirect).
- **Admin APIs (all `isAuthed`-gated):** `app/api/admin/{practitioners,practitioners/[id],ai-queries,lessons,lessons/[id],reporting,reporting/export,media,media/[id],media/upload,media/thumbnail,media/cleanup,widgets,widgets/[id]}`.
- **Data layer:** `lib/db.ts` — single module, all functions `async`. Tables (base + migrations): `practitioners` (+ `has_seen_welcome`), `events, auth_tokens, clicks, ai_queries, lessons, lesson_completions, login_events, media` + Part-1 tables + `homepage_widgets` (Part 2 What's New cards). Base schema auto-creates then `lib/migrations.ts` runs on first connection. `SCHEMA` is exported for tests.
- **Domain libs:** `lib/pipeline.ts` (application processing), `lib/registers/*` (name-based register verification), `lib/decision.ts` (auto-approve/flag), `lib/codes.ts` (affiliate codes, `portalUrl`, `referralLink`), `lib/access.ts` (`hasAccess` audience gate — used for widget filtering + nav), `lib/ai/*` (KB/RAG, safety, assistant, handout), `lib/lessons/*`, `lib/reporting/*`, `lib/emails/templates.ts`, `lib/providers/{email,smtp,resend,affiliates}.ts`, `lib/media/thumbnail.ts`.
- **Auth:** admin = `lib/adminAuth.ts` (`isAuthed(req)`, cookie `wn_admin`, 12h). Practitioner = `lib/practitionerAuth.ts` (`getSessionPractitioner(req)`, HMAC-signed `wn_session` cookie, 30d; magic-link tokens 15min via `lib/magicLink.ts`). **Server components** read the session via `lib/serverSession.ts` `getServerSessionPractitioner()` (cookies() + verify + getPractitioner).
- **Chrome:** `components/SiteHeader.tsx` (server, context-aware: practitioner nav when signed-in, Apply/Sign in otherwise) + `components/LogoutButton.tsx` (client). `components/ChromeGate.tsx` (client) hides header/footer on `/onboarding/*` full-takeover routes. Welcome fonts (Fraunces/Inter) are loaded via `app/onboarding/welcome/fonts.ts` (`next/font/google`), scoped to that route only — a deliberate break from the brand Gestura/Basis stack.

## Conventions (match these)
- Every `lib/db.ts` fn is **async** — always `await`. Tests set `process.env.DB_PATH` to a temp file and call `resetDbForTests()`; raw SQL in tests via `execForTests()`.
- API route files export `const dynamic = 'force-dynamic'`. Admin routes: `if (!isAuthed(req)) return 401 {error:'Unauthorised'}`. Practitioner routes: `getSessionPractitioner` + require `status === 'approved'`.
- Validate request bodies with **zod**; wrap `req.json()` in try/catch → 400 on bad body.
- **TDD**: write the failing test first, then implement. Keep `npm test` green.
- Brand Tailwind tokens: `ink #191919`, `ink2`, `terracotta #a45248`, `cream #f8f6f3`, `sage #d0d1ab`, `stone #e6e3df`, `forest #3a4f41`; fonts `font-heading` (Gestura). Page containers are centered `mx-auto max-w-*` (practitioner 4xl/5xl, admin 7xl).

## Critical gotchas
- **DB must be Turso in production.** `lib/db.ts` intentionally throws (no `/tmp` fallback) on serverless without `TURSO_DATABASE_URL`, and wraps the libSQL client with a `cache:'no-store'` fetch (Next.js otherwise caches query *results* → stale/deleted rows in admin). Do not reintroduce a `/tmp` fallback or default fetch caching.
- **Never reference `care@wildnutrition.com`** anywhere (reply-to, copy, User-Agent). Contact is `utkarshrawatofficial@gmail.com`.
- Register verification is **name-based** (registers expose no number/API lookup); auto-approve only on qualified + high-confidence match, else flag.
- Approved-on-apply practitioners are **auto-logged-in** (session cookie set in `app/api/apply/route.ts`).
- External integrations run in **mock mode** without keys — the app is fully exercisable; real data lights up when keys are added.

## Build status
**Parts 1–8 all built + deployed.** Only **Shopify connect** remains (last step). Admin = **16 tabs**
(15 + **Live Chat**). **Part 8 — Live Chat:** fast-polling (~2.5s) practitioner↔admin support chat +
capture DB (migration `013_live_chat`) + shell-level admin popup + daily email backstop (`cron/chat-alerts`;
**Vercel is Hobby → cron is once/day, a `*/5` schedule fails to deploy**) + Insights & FAQs (stats/CSV always-on;
AI FAQ clustering via the Gemini seam, degrades gracefully on 429). Widget in `components/ChatWidget.tsx`
(mounted via `ChatGate` in layout). **Welcome takeover now plays on EVERY login** via the per-login `wn_welcome`
cookie (`lib/welcomeGate.ts`), not the permanent `has_seen_welcome` flag. See `PRACTSESSION_HANDOFF.md`
"NEWEST SESSION" block + `docs/superpowers/specs/2026-07-16-live-chat-design.md`.
See `PRACTSESSION_HANDOFF.md` "LATEST SESSION" block for the authoritative, exhaustive state.
Ask the Expert (`/assistant`) + Content Factory run on **Google Gemini** (provider-agnostic; `selectProvider()`
in `lib/ai/assistant.ts`, key fallback `GEMINI_API_KEY`→`GEMINI_API_KEY2`). Clinical Toolkit (`/toolkit`),
Clinical Pearls (migration 012), Content Calendar are live.

## Patient Carts — practitioner-curated cart → pay link (2026-07-19)
Demo-ready (built for an exec presentation), runs on a **mock commerce provider** — no Shopify needed. A practitioner
builds a cart for a patient from a mock catalog of **real Wild Nutrition products** (`lib/commerce/catalog.mock.ts`,
real Shopify-CDN images), gets a tokenized login-free pay link, and the patient pays on a branded mock checkout;
the sale is attributed to the practitioner via the existing `recordOrder` pipeline and shows in dashboard/Reporting revenue.
- **Provider seam** `lib/commerce/` (`commerceProvider()` = 'shopify' when store creds set, else 'mock'; the swap point).
  `getCatalog()` + `createDraftOrder()` are the two functions to implement for real Shopify (draft order → invoice_url).
- **DB** migration `016_patient_carts` (`patient_carts` + `patient_cart_items`); helpers `createPatientCart`,
  `getCartByToken`, `listPatientCartsForPractitioner`, `markCartSent`, `markCartPaid` in `lib/db.ts`. Token = opaque random.
- **Practitioner** `/carts` (`components/CartsApp.tsx`, nav link in SiteHeader); APIs `app/api/me/{catalog,carts,carts/[id]/send}`.
  Server recomputes all prices from the catalog (client prices ignored). Pricing: 10% patient discount, 20% commission.
- **Patient** `/pay/[token]` (`components/PayPage.tsx`, chrome hidden via ChromeGate); API `app/api/pay/[token]` (view + mock pay,
  idempotent attribution). Demo card form collects nothing that is stored/sent.
- Spec/plan: `docs/superpowers/{specs,plans}/2026-07-19-patient-carts*.md`. Deployed + browser-verified end-to-end.
- Follow-ups (non-blocking, from final review): guard getCatalog/createDraftOrder so setting Shopify creds can't half-activate
  (they still return mock); surface create-cart errors in CartsApp UI; PayPage money() hardcodes £.

## Presence — "Live Now" (2026-07-19)
Admin-only Messenger-style presence in the **Live Chat** tab. Signed-in practitioners heartbeat
`POST /api/me/presence` every 30s while the tab is focused (`components/PresenceBeat.tsx`, mounted next to
`ChatGate` in `app/layout.tsx`; pauses when the tab is hidden), updating `practitioners.last_seen_at`
(migration `015_presence`, `touchPresence`). Online = seen within `PRESENCE_WINDOW_SECONDS` (=90). The admin
Live Chat tab shows an **"Online now (N)"** strip + green/grey dots per conversation row (`listOnlinePractitioners`,
`online` flag on `listConversationsForAdmin`, `GET /api/admin/presence`, `components/AdminChat.tsx`). Clicking an
online practitioner starts/opens a chat via `POST /api/admin/chat {practitionerId}` (reuses `getOrCreateOpenConversation`).
Spec/plan: `docs/superpowers/{specs,plans}/2026-07-19-presence-live-now*.md`. Deployed + browser-verified.

## Onboarding — student certification (2026-07-17)
Qualified applicants onboard as before. A **student** applicant is flagged (`STUDENT_MANUAL`) AND automatically
emailed a secure, self-expiring upload link (`lib/certUpload.ts`, HMAC `cert:`-prefixed token — never a login
session; `certificationRequestEmail`). They upload proof of study at `/upload-certification?token=…`
(`app/api/certification` → Vercel Blob under `certifications/`; migration `014_certifications` adds the
`certification_*` columns + `setCertification`). The admin **Flagged** detail then shows a "Student certification"
block ("Open certification →" + timestamp) above Approve/Reject. Emailed only for `STUDENT_MANUAL`, not duplicates.
Ask the Expert now cites **all** supporting KB docs (`sources: string[]` + top-level `sources_reviewed`), cross-
references clinical materials, and drops fabricated citations (`isKnownDocument`) — active once a provider works.

## Integration / env status (Vercel production)
Set: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `PORTAL_URL`,
`COMMISSION_PERCENT` (20), `GMAIL_USER`, `GMAIL_APP_PASSWORD` (transactional email — live),
`BLOB_READ_WRITE_TOKEN` (Vercel Blob — live), `CRON_SECRET`, `GEMINI_API_KEY` + `GEMINI_API_KEY2`
(Ask the Expert + Content Factory — **both currently 429 quota-exhausted; enable billing/raise quota**).
Optional: `GEMINI_MODEL` (default `gemini-2.0-flash`).
**Not set (features mock until added):** `ANTHROPIC_API_KEY` (legacy AI fallback + lesson generation),
`SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` (real discount codes/orders/revenue/tiers → currently £0).
Mailchimp not needed (Gmail SMTP covers transactional).
