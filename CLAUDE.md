# CLAUDE.md — Wild Nutrition Practitioner Hub

Agent-facing guide to this repo. **For the complete, self-contained master handover, read `HANDOVER.md` first.**
Running locally: `docs/CLOUDFLARE_DEV.md`. Deploying: `docs/CLOUDFLARE_GO_LIVE.md`.
Knowledge base: `docs/KB_AUTHORING.md`. Dated specs/plans in `docs/superpowers/{specs,plans}/`.

> `PROJECT_HANDOFF.md` and `PRACTSESSION_HANDOFF.md` are **pre-Cloudflare history** — good for *why*,
> misleading about *how it runs today*. See `HANDOVER.md` §17.

## What this is
A Next.js 15 (App Router) practitioner community platform for Wild Nutrition: onboarding + register
verification, a passwordless practitioner dashboard, an AI protocol assistant, education/lessons, a
media/resources library, clinical toolkit, community + events, live chat + presence, patient carts, a
practitioner referral network, and a password-gated admin console with reporting.

**Single Next.js app on Cloudflare Workers** (via OpenNext): **D1** database, **R2** storage, **Resend**
email, **Gemini** AI. Raw parameterised SQL, no ORM. **Not deployed yet** — go-live needs company
Cloudflare access. It is **not on Vercel** any more.

## Commands
```bash
npm run dev                 # local dev, http://localhost:3100 (Node path, mock mode, no keys)
npm run preview:cf          # REAL Cloudflare runtime: workerd + local D1/R2, http://localhost:8787
npm test                    # Vitest — 381 tests, keep green
npm run build               # production build (also the type-check gate; stop dev server first)
npm run bundle-kb           # re-bundle knowledge/ → lib/ai/kb.bundle.json (REQUIRED after KB edits)
npm run generate-lessons    # offline lesson pipeline (needs ANTHROPIC_API_KEY)
```
Admin: `/admin`, password = `ADMIN_PASSWORD`.

## Architecture map
- **Worker entry:** `worker.ts` (per `wrangler.toml` `main`) wraps OpenNext's generated
  `.open-next/worker.js` and adds `scheduled()` for Cron Triggers. Bindings: D1 `DB`, R2 `BUCKET`.
- **Pages:** `app/{apply,dashboard,assistant,learning,library,resources,toolkit,community,events,leaderboard,cpd,carts,referrals,admin}/page.tsx`,
  `app/pay/[token]`, `app/onboarding/welcome`, `app/upload-certification`; `app/page.tsx` → `/apply`.
  `app/dashboard/page.tsx` is a **server** shell that reads the session and redirects first-timers to
  `/onboarding/welcome`, else renders the client `DashboardApp`.
- **Practitioner/public APIs:** `app/api/{apply,me/*,auth/*,library,resources,assistant,certification,pay/[token],r/[code],files/[...key],webhooks/shopify,cron/*}`.
  `/api/files/[...key]` serves auth-gated R2 objects.
- **Admin APIs (all `isAuthed`-gated):** `app/api/admin/{login,logout,practitioners,ai-queries,lessons,reporting,media,widgets,pathways,toolkit,events,community,pearls,factory,automation,calendar,presence,chat,referrals}`
  (+ their `[id]`/sub-routes).
- **Data layer:** `lib/db.ts` — single module, every function `async`. `rawClient()` takes the **D1
  binding first** (so `@libsql/client` is never referenced on the Worker), else dynamically imports
  `@libsql/client` against a `file:`/Turso URL. Base `SCHEMA` auto-creates, then `lib/migrations.ts`
  (`001_orders` … `017_practitioner_referrals`) runs on first connection. `SCHEMA` exported for tests.
- **Bindings:** `lib/db/binding.ts` `getD1Binding()` / `getR2Binding()` — lazily requires
  `@opennextjs/cloudflare` behind try/catch, so Node builds and Vitest get `null`, never an error.
- **Storage:** `lib/storage/index.ts` — R2 with a local-disk fallback (`data/uploads/`) off-Workers.
- **Email:** `lib/providers/email.ts` prefers **Resend → SMTP → mock**. `smtp.ts` lazy-loads `nodemailer`
  so it never bundles into the Worker.
- **AI:** `lib/ai/*` — `kb.ts` (loads `knowledge/` from disk in Node, falls back to the bundled
  `kb.bundle.json` on Workers), `kbValidate.ts` (dossier contract + clinical-review gate), `assistant.ts`
  (`selectProvider()`, Gemini → dormant Anthropic), `safety.ts`.
- **Cron:** `wrangler.toml [triggers]` declares schedules; `lib/cron/map.ts` maps each expression to its
  route; `worker.ts scheduled()` calls it with `CRON_SECRET`.
- **Domain libs:** `pipeline.ts` (application processing + referral attribution), `registers/*`
  (name-based verification), `decision.ts`, `codes.ts`, `access.ts` (`hasAccess` audience gate),
  `stats.ts`, `reporting/*`, `lessons/*`, `automation/*`, `chat/*`, `commerce/*`, `events/*`, `media/*`,
  `certUpload.ts`, `certificates.ts`, `uploadClient.ts`, `emails/templates.ts`.
- **Auth:** admin = `lib/adminAuth.ts` (`isAuthed(req)`, cookie `wn_admin`, 12h). Practitioner =
  `lib/practitionerAuth.ts` (`getSessionPractitioner(req)`, HMAC `wn_session`, 30d; magic-link tokens
  15min via `lib/magicLink.ts`). Server components use `lib/serverSession.ts`.
- **Chrome:** `SiteHeader` (server, audience-filtered nav) + `HeaderNav` (client, desktop + mobile
  hamburger), `ChromeGate` (hides chrome on `/onboarding/*`, `/pay`), `ChatGate`, `PresenceBeat`.

## Conventions (match these)
- Every `lib/db.ts` fn is **async** — always `await`. Tests set `process.env.DB_PATH` to a temp file and
  call `resetDbForTests()`; raw SQL in tests via `execForTests()`.
- API route files export `const dynamic = 'force-dynamic'`. Admin routes:
  `if (!isAuthed(req)) return 401 {error:'Unauthorised'}`. Practitioner routes: `getSessionPractitioner`
  + require `status === 'approved'`.
- Validate request bodies with **zod**; wrap `req.json()` in try/catch → 400 on bad body.
- **TDD**: write the failing test first, then implement. Keep `npm test` green at every commit.
- **Two gates before "done":** `npm test` and `npm run build`. For anything touching the Cloudflare
  runtime (DB, storage, cron, routes) **also** verify on `npm run preview:cf`.
- Brand Tailwind tokens: `ink #191919`, `ink2`, `terracotta #a45248`, `cream #f8f6f3`, `sage #d0d1ab`,
  `stone #e6e3df`, `forest #3a4f41`; `font-heading` (Gestura). Containers centered `mx-auto max-w-*`
  (practitioner 4xl/5xl, admin 7xl).
- Mobile: `min-w-0` on wide grid/flex items; `overflow-x-auto` wrapper on wide tables.

## Critical gotchas
- **Mock-until-keyed is sacred.** Every integration runs with no secrets and lights up when its key
  appears — never make a feature hard-require a key to boot.
- **Edited anything under `knowledge/`? Run `npm run bundle-kb` and commit `lib/ai/kb.bundle.json`.**
  Workers has no filesystem and reads only the bundle, so a stale bundle serves outdated clinical content
  in production while `npm run dev` looks correct. `tests/kb-sync.test.ts` catches it.
- **`preview:cf` catches what unit tests cannot.** Tests run the libSQL/file path; D1 has its own
  behaviour (one bug slipped past every unit test during the migration and was only caught there).
- **Adding a cron schedule means editing BOTH `wrangler.toml [triggers]` and `lib/cron/map.ts`.**
- **Never reference `care@wildnutrition.com`** anywhere (reply-to, copy, User-Agent). Contact is
  `utkarshrawatofficial@gmail.com`.
- Register verification is **name-based** (registers expose no number/API lookup); auto-approve only on
  qualified + high-confidence match, else flag.
- Approved-on-apply practitioners are **auto-logged-in** (session cookie set in `app/api/apply/route.ts`).
- **Windows:** `npm run preview:cf` does not run there (`Could not resolve "@libsql/client"`; OpenNext is
  not fully Windows-compatible). Use macOS/Linux/WSL for Cloudflare-runtime checks.

## Build status
**Parts 1–8 + Presence + Patient Carts + Referral Network are built; the Cloudflare migration is done and
was verified end-to-end on `preview:cf`.** Admin = **16 sections**. 381 tests green, build clean, runs in
mock mode with no keys.

**Remaining — two tracks:**
- **Track A — go live** (config only, no code): follow `docs/CLOUDFLARE_GO_LIVE.md` once company
  Cloudflare access lands. ~30 min.
- **Track B — feature gaps:** ① **Shopify connect** — implement the `shopify` branch of
  `getCatalog()`/`createDraftOrder()` in `lib/commerce/index.ts` (they return mock even when the provider
  is `'shopify'` — a half-activated state to guard) + reconcile `patient_carts` by `external_id` in
  `/api/webhooks/shopify`. **The biggest gap.** ② replace the 5 unapproved draft KB dossiers with
  clinically signed-off ones, then `npm run bundle-kb`. ③ AI quota (Gemini 429 — config only).
  ④ polish: `CartsApp` swallows failed-create errors, `PayPage money()` hardcodes `£`, coming-soon stubs,
  placeholder `FB_GROUP_URL` in `CommunityApp.tsx`. ⑤ add a `*/5 * * * *` chat-alerts trigger (the old
  daily cap was a Vercel Hobby limit that no longer applies). ⑥ wire Sentry. ⑦ optional Referral v2.

See `HANDOVER.md` §13 for the full gap list with file-level detail.
