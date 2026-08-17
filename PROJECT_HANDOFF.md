> **⚠️ HISTORICAL — PRE-CLOUDFLARE, AND THE OLDEST DOC HERE. DO NOT TRUST THE STACK OR DEPLOY DETAILS.**
>
> **⟹ START WITH [`HANDOVER.md`](HANDOVER.md)** — the current master handover.
>
> This is the earliest history (2026-07-10), from when the app ran on **Vercel + Turso + Vercel Blob**.
> Since **2026-08-17** it runs on **Cloudflare Workers + D1 + R2 + Resend**. See `HANDOVER.md` §17.

# Wild Nutrition Practitioner Portal — Full Project Handoff

_Last updated: 2026-07-10. Self-contained reference for continuing this project in a new chat._

## 1. What this is

An end-to-end **practitioner community platform for Wild Nutrition** (a UK supplement brand),
styled as an extension of `wildnutrition.com/pages/practitioner-community`. It automates
practitioner onboarding, gives practitioners a self-serve dashboard, provides an AI protocol
assistant and an education hub, and gives the internal team a reporting layer. Built as one
Next.js app.

## 2. Where everything lives

| Thing | Value |
|---|---|
| **Local repo** | `/Users/utkarshrawat/Wild Dash/practitioner-portal` (git, branch `main`) |
| **Live URL (production)** | https://practitioner-portal-rose.vercel.app |
| **Vercel project** | `practitioner-portal`, team `utkarsh-projects12`, account `utkarshrawatofficial-2811` (CLI already authed on this machine) |
| **Admin login** | `/admin` → password **`wild-admin-2026`** (env var `ADMIN_PASSWORD`) |
| **Tests** | 29 test files, **133 tests, all passing** (`npm test`) |
| **Separate sibling project (not this one)** | `../wild-dash` = the SKU inventory dashboard — unrelated |

## 3. Tech stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind** (brand tokens configured)
- **libSQL / Turso** database via `@libsql/client` (async) — migrated from better-sqlite3 so it
  can persist on Vercel serverless. Falls back to a local file when no Turso URL is set.
- **Claude API** (`@anthropic-ai/sdk`, model `claude-opus-4-8`) for the AI assistant + lesson generator
- **Vitest** for tests (TDD throughout)
- Brand tokens: fonts `Gestura`/`Basis`; palette ink `#191919`, terracotta `#a45248`, cream
  `#f8f6f3`, sage `#d0d1ab`, stone `#e6e3df`, forest `#3a4f41`

## 4. Features built (all merged to `main`, all verified live or by test)

### A. Practitioner onboarding (Prompt 1)
- **`/apply`** — branded public application form (name, email, register body BANT/CNHC/NNA/ANP,
  membership number, qualified/student).
- **Hybrid verification**: on submit, an automated **name-based lookup** against the chosen
  register's public directory scores confidence (high/partial/none/unavailable). Qualified +
  high-confidence name match → **auto-approved** (code issued instantly). Everything else
  (partial/none/unavailable/student/duplicate) → **flagged for manual admin review**. Note:
  UK registers have no public API or membership-number search, so the check is name-based and
  deliberately conservative; the admin does the final call with a one-click pre-filled directory
  link. Best-effort, ToS-respecting (1 req/sec, identified User-Agent, 8s timeout).
- On approval: generates affiliate code `WN-SURNAME-XXXX`, a referral link, stores the record,
  triggers a welcome email (mock until Mailchimp keys), and writes an audit trail.
- **`/admin`** — password-gated review queue (Flagged/Approved/Rejected/All tabs) with reason
  codes, the register-search link, and approve/reject/retry-sync buttons.
- Key files: `lib/registers/*`, `lib/decision.ts`, `lib/pipeline.ts`, `lib/codes.ts`,
  `lib/providers/{affiliates,email}.ts`, `app/apply`, `app/api/apply`, `components/ApplyForm.tsx`,
  `components/AdminDashboard.tsx`.

### B. Practitioner self-serve dashboard (Prompt 2)
- **`/dashboard`** — passwordless **magic-link login** (email → one-time 15-min token → 30-day
  HMAC-signed session cookie). Only approved practitioners can log in. In mock mode the login
  link is shown on screen.
- Shows: referral code + link (one-click copy), live stats (clicks, orders, conversion,
  commission at 20% — orders/revenue from Shopify when keyed, else 0), tier card, and
  "Lessons completed" (CPD). Stats refresh every 60s.
- **Click tracking**: referral links are `{PORTAL_URL}/r/CODE` → records the click → 302
  redirects to the Shopify discount URL with UTMs.
- Key files: `lib/practitionerAuth.ts`, `lib/magicLink.ts`, `lib/stats.ts`,
  `app/api/auth/*`, `app/api/me/*`, `app/r/[code]`, `components/DashboardApp.tsx`.

### C. AI protocol assistant (Prompt 3)
- **`/assistant`** (practitioner login) — enter a client profile in natural language, get a
  suggested Wild Nutrition protocol + a **printable branded client handout** (HTML, print-to-PDF)
  that auto-includes the practitioner's discount code.
- **Grounded (RAG)**: the whole markdown knowledge base in `knowledge/` is loaded into the
  system prompt (cached); the model may only recommend products present there, with dosing
  quoted verbatim; a post-generation check **strips any product not in the KB**.
- **Three-net safety layer**: deterministic pre-screen (pregnancy, medication, minor, serious
  condition) → model must emit safety flags & defer to clinical judgement / technical support →
  post-validation grounding strip. Out-of-scope requests are declined.
- **Audit log**: every query + output logged to `ai_queries`, visible in the admin "AI queries" tab.
- Sample KB dossiers are marked "SAMPLE — replace before live use."
- Needs `ANTHROPIC_API_KEY` (shows "not configured" until set).
- Key files: `lib/ai/{kb,safety,assistant,handout}.ts`, `app/api/assistant`,
  `app/assistant`, `components/AssistantApp.tsx`, `components/AdminAiQueries.tsx`, `knowledge/`.

### D. Education hub (Prompt 4)
- **Offline pipeline** `npm run generate-lessons`: reads raw sources from `content-sources/`
  (md/txt/PDF), Claude turns each into 1–4 microlearning lessons (title, 200–400-word summary,
  3–5 takeaways, interactive multiple-choice quiz, topic tags) → written as **drafts**, never
  auto-published. Clinical claims not traceable to the source are flagged (by the model + a
  deterministic scanner).
- **Admin "Lessons" tab**: inline-edit every field + claim-flag banner → Approve (publish) or Reject.
- **`/library`** (practitioner login): browse/search published lessons by topic, take the quiz
  self-check, "Mark as complete" → CPD count on the dashboard.
- Needs `ANTHROPIC_API_KEY` for generation only; library/review/tracking work without it.
- Key files: `lib/lessons/{topics,claims,sources,generate}.ts`, `scripts/generate-lessons.ts`,
  `app/api/admin/lessons/*`, `app/api/library/*`, `app/library`, `components/{AdminLessons,LibraryApp}.tsx`,
  `content-sources/`.

### E. Internal reporting layer (Prompt 6)
- **`/admin` → "Reporting" tab** (admin-only) — one row per practitioner combining referral
  revenue, engagement score, tier, dormancy + churn risk, education completion. Sortable,
  filterable, with **CSV export** (`/api/admin/reporting/export`).
- Self-contained scoring (config in `lib/reporting/scoring.ts`): **Tier** Standard/Silver/Gold at
  £0/£1k/£3k rolling-12-month revenue; **Engagement** 0–100 blend of logins+clicks+lessons+AI
  usage; **Power-user** = top 20% by revenue; **Churn-risk** = approved + no referral 60d + falling
  activity; **Dormant** = no referral 90d.
- Added **login logging** (`login_events` table, written on magic-link verify) to feed engagement.
- Key files: `lib/reporting/{scoring,signals,report,csv}.ts`, `app/api/admin/reporting/*`,
  `components/AdminReporting.tsx`.

### NOT built
- **Prompt 5 (tiering + engagement _automation_)**: scheduled monthly tier recalculation, opt-in
  leaderboard, lifecycle re-engagement/recognition emails, quarterly impact-report emails. This
  was **designed in chat but never approved/built**. The reporting layer (E) computes tier/risk
  itself as a read-model, so it does not depend on Prompt 5. If you want Prompt 5, it's a fresh build.

## 5. Database

libSQL/Turso. `lib/db.ts` is the single data layer (all functions async). Tables:
`practitioners`, `events`, `auth_tokens`, `clicks`, `ai_queries`, `lessons`,
`lesson_completions`, `login_events`. Schema auto-creates on first connection.
Connection resolves: `TURSO_DATABASE_URL` (+`TURSO_AUTH_TOKEN`) if set → else `DB_PATH` file →
else `/tmp` on Vercel → else `data/practitioners.db` locally.

## 6. Environment variables

| Var | Purpose | Status |
|---|---|---|
| `ADMIN_PASSWORD` | `/admin` login | **set in Vercel** (`wild-admin-2026`) |
| `SESSION_SECRET` | signs practitioner session cookies | **set in Vercel** |
| `PORTAL_URL` | base URL for referral + magic links | **set in Vercel** (the rose URL) |
| `COMMISSION_PERCENT` | commission calc (default 20) | **set in Vercel** |
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | durable database | **NOT set** — needed for persistence (see §8) |
| `ANTHROPIC_API_KEY` | AI assistant + lesson generator | **NOT set** — features show "not configured" |
| `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` | real discount codes + revenue/tiers | **NOT set** (mock = £0) |
| `MAILCHIMP_API_KEY` + `MAILCHIMP_AUDIENCE_ID` | welcome/marketing emails | **NOT set** (mock/logged) |

## 7. Commands

```bash
cd "/Users/utkarshrawat/Wild Dash/practitioner-portal"
npm install
npm run dev                 # local dev on http://localhost:3100
npm test                    # 133 tests
npm run build               # production build
npm run generate-lessons    # offline lesson pipeline (needs ANTHROPIC_API_KEY)
npx vercel --prod --yes     # deploy production (CLI already authed)
```

## 8. Current status & the one open task

Everything above is **built, tested (133/133), and deployed live** at
https://practitioner-portal-rose.vercel.app.

**Open item — durable persistence.** The app is currently deployed but the database is not yet
persistent on Vercel (it falls back to `/tmp`, which is per-instance and ephemeral, so a
registration submitted on one serverless instance won't reliably show up in the admin queue).
The code is fully **Turso-ready** (migrated + tested). To finish:
1. Create a free Turso database at **https://app.turso.tech** (GitHub sign-up).
2. Copy the **Database URL** (`libsql://…`) and a **token** (Create Token).
3. Set them in Vercel: `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, then redeploy (`npx vercel --prod`).
4. After that, registrations persist and appear in `/admin` permanently.

(Blocked only because creating the Turso account needs an interactive browser sign-up.)

## 9. Design docs (in-repo)

Specs: `docs/superpowers/specs/*` — onboarding, dashboard, AI assistant, education hub, reporting.
Plans: `docs/superpowers/plans/*` — matching implementation plans.

## 10. Key facts / gotchas for a new chat

- All db functions are **async** — always `await`. Tests use `execForTests(sql, args)` for raw SQL
  (the old `getDb()` is gone).
- External integrations (Shopify, Mailchimp, Anthropic) run in **mock mode** without keys — the
  whole app is exercisable now; real data lights up when keys are added.
- Verification is **name-based**, not membership-number-based (registers expose no number lookup).
- Sample knowledge-base dossiers and lesson sources are placeholders marked "SAMPLE — replace
  before live use."
- The Vercel CLI on this machine is already authenticated; the Turso account is not.
