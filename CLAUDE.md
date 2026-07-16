# CLAUDE.md — Wild Nutrition Practitioner Hub

Agent-facing guide to this repo. For a fuller narrative history see `PROJECT_HANDOFF.md`.
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

## Integration / env status (Vercel production)
Set: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `PORTAL_URL`,
`COMMISSION_PERCENT` (20), `GMAIL_USER`, `GMAIL_APP_PASSWORD` (transactional email — live),
`BLOB_READ_WRITE_TOKEN` (Vercel Blob — live).
**Not set (features mock until added):** `ANTHROPIC_API_KEY` (AI assistant + lesson generation),
`SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` (real discount codes/orders/revenue/tiers → currently £0).
Mailchimp not needed (Gmail SMTP covers transactional).
