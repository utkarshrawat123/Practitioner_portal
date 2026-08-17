# Launch Checklist — Wild Nutrition Practitioner Hub

Generated for Part 7 (Content Factory, Polish, QA & Launch). Keep this updated as items are signed off.

## 1. Content to replace (still SAMPLE — do not launch with these)

| Item | Location | Status |
|---|---|---|
| KB dossiers (5 draft products) | `knowledge/products/*.md` (ashwagandha-plus, food-grown-multi-women, iron-plus, magnesium, omega-3) | ⬜ Replace with clinically approved dossiers |
| Contraindications / dosing guides | `knowledge/contraindications.md`, `knowledge/dosing-principles.md` | ⬜ Confirm clinically or replace |

> **Enforced gate:** every KB document carries `> **Clinical review:** AWAITING APPROVAL | APPROVED …`.
> `docsAwaitingClinicalApproval()` must return an **empty list** before the assistant is used with real
> practitioners — all 7 documents are currently AWAITING APPROVAL, and `tests/kb-contract.test.ts` asserts
> it. After editing anything under `knowledge/`, run `npm run bundle-kb` and commit
> `lib/ai/kb.bundle.json`. Full contract: `docs/KB_AUTHORING.md`.
| Sample lessons / media | admin **Lessons** / **Media** tabs | ⬜ Replace placeholders |
| Facebook Group URL | `components/CommunityApp.tsx` `FB_GROUP_URL` | ⬜ Replace placeholder with real group URL |
| Any Content-Factory drafts | admin Lessons / Toolkit / Pearls review queues | ⬜ Review + approve before publish |

> Rule (from the build plan): **never auto-publish AI-generated clinical content.** Every Content-Factory
> asset lands as a draft and must be approved by a human admin.

## 2. Secrets — set on the Cloudflare Worker at go-live

Nothing here is needed to run locally: the app boots and is fully exercisable in mock mode with no keys.
Set these via `npx wrangler secret put <NAME>` or the dashboard. Full walkthrough:
`docs/CLOUDFLARE_GO_LIVE.md`.

| Secret | Purpose | Status |
|---|---|---|
| *(D1 binding `DB`)* | Database — `wrangler.toml`, needs the real `database_id` | ⬜ create at go-live |
| *(R2 binding `BUCKET`)* | Media / certificates / uploads | ⬜ create at go-live |
| `R2_PUBLIC_BASE` | Public R2 URL used to build media URLs | ⬜ not set |
| `ADMIN_PASSWORD` | `/admin` login | ⬜ not set |
| `SESSION_SECRET` | Practitioner session HMAC + cert-upload tokens | ⬜ not set |
| `PORTAL_URL` | Referral / magic-link / cron self-call base | ⬜ set in `[vars]` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Transactional email (Gmail SMTP can't run on Workers) | ⬜ not set |
| `CRON_SECRET` | Authorises the scheduled cron calls | ⬜ not set |
| `COMMISSION_PERCENT` | Referral commission (=20) | ✅ in `[vars]` |
| `GEMINI_API_KEY`, `GEMINI_API_KEY2` | Ask the Expert + Content Factory | ⚠️ **quota-exhausted (429)** — enable billing / raise quota |
| `GEMINI_MODEL` | Optional model override (default `gemini-2.0-flash`) | ⬜ optional |
| `ANTHROPIC_API_KEY` | Optional AI fallback + lesson generation | ⬜ not set (optional) |
| `SHOPIFY_STORE_DOMAIN` / `SHOPIFY_ADMIN_TOKEN` / `SHOPIFY_WEBHOOK_SECRET` / `AFFILIATE_DISCOUNT_PERCENT` | Revenue + tiers | ❌ not set — **last step** |

**No longer used** (retired with the Vercel platform): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
`BLOB_READ_WRITE_TOKEN`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, all `VERCEL_*`.

## 3. Shopify (final step)
- [ ] Set the four Shopify env vars in production.
- [ ] Register `orders/create` + `orders/paid` webhooks against the **production** store → `/api/webhooks/shopify` with `SHOPIFY_WEBHOOK_SECRET`.
- [ ] Confirm a real order carrying a `WN-…` discount code appears in the `orders` table and lights up the dashboard/reporting.

## 4. Scheduled jobs
- [ ] **Cloudflare Cron Triggers** (`wrangler.toml [triggers]`) activate on deploy: `0 6 * * *` →
  `/api/cron/run` (tiering, lifecycle emails), `0 7 * * *` → `/api/cron/chat-alerts`. `worker.ts`
  `scheduled()` dispatches via `lib/cron/map.ts` with `CRON_SECRET`. Confirm both fire after the first deploy.
- [ ] Consider moving chat alerts to `*/5 * * * *` — the old daily cap was a **Vercel Hobby** limit that no
  longer applies. Requires editing **both** `wrangler.toml` and `lib/cron/map.ts`.

## 5. QA sign-off (Part 7)
- [x] **Permission audit** — every audience-gated practitioner route filters through `hasAccess`: pathways, events, toolkit, pearls, homepage widgets. Media/community/leaderboard have no audience dimension. No gaps found.
- [x] **Empty states** — a zero-activity practitioner sees sensible empty states on learning, cpd, toolkit, resources, community, events, leaderboard (no broken pages).
- [x] **Rate limiting** — Ask the Expert capped at 30 queries/practitioner/hour (429 beyond). Consultation booking form is still a coming-soon stub (no form to rate-limit yet).
- [ ] **Mobile** — spot-checked at 375px in dev; do a final pass on real devices before go-live.
- [ ] **Error monitoring** — not wired. Errors are logged (`console.error`) and recorded in `ai_queries` /
  `automation_runs`. On Workers, `console.error` goes to `wrangler tail` / the dashboard's Workers Logs,
  which is the zero-setup baseline. For durable alerting, provide a `SENTRY_DSN` and wire Sentry — note
  that on Workers this needs the Cloudflare-compatible setup (`@sentry/cloudflare`), **not** the
  `@sentry/nextjs` Node integration the Vercel-era note assumed.

## 6. Test data to clean up before launch
- **Nothing to clean.** There is no live deployment: the Cloudflare D1 database will be created empty and
  self-migrates on first request, so launch starts from a clean slate. The old Vercel-era Turso database
  (which did hold test practitioners) is out of the picture.
- Avoid creating demo practitioners on the real D1 database. If you must, note them here and remove them
  afterwards with `wrangler d1 execute` — there is still no delete-practitioner button in the admin UI.
