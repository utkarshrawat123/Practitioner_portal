# Launch Checklist — Wild Nutrition Practitioner Hub

Generated for Part 7 (Content Factory, Polish, QA & Launch). Keep this updated as items are signed off.

## 1. Content to replace (still SAMPLE — do not launch with these)

| Item | Location | Status |
|---|---|---|
| KB dossiers (5 sample products) | `knowledge/products/*.md` (ashwagandha-plus, food-grown-multi-women, iron-plus, magnesium, omega-3) | ⬜ Replace with real dossiers |
| Contraindications / dosing guides | `knowledge/contraindications.md`, `knowledge/dosing-principles.md` | ⬜ Confirm clinically or replace |
| Sample lessons / media | admin **Lessons** / **Media** tabs | ⬜ Replace placeholders |
| Facebook Group URL | `components/CommunityApp.tsx` `FB_GROUP_URL` | ⬜ Replace placeholder with real group URL |
| Any Content-Factory drafts | admin Lessons / Toolkit / Pearls review queues | ⬜ Review + approve before publish |

> Rule (from the build plan): **never auto-publish AI-generated clinical content.** Every Content-Factory
> asset lands as a draft and must be approved by a human admin.

## 2. Environment variables — confirm set in Vercel production

| Var | Purpose | Status |
|---|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Durable DB | ✅ set |
| `ADMIN_PASSWORD` | `/admin` login | ✅ set |
| `SESSION_SECRET` | Practitioner session HMAC | ✅ set |
| `PORTAL_URL` | Referral / magic-link base | ✅ set |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Transactional email | ✅ set |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (media, certs, uploads) | ✅ set |
| `CRON_SECRET` | Cron auth for `/api/cron/run` | ✅ set |
| `COMMISSION_PERCENT` | Referral commission | ✅ set |
| `GEMINI_API_KEY`, `GEMINI_API_KEY2` | Ask the Expert + Content Factory (Gemini, with fallback) | ⚠️ set but **quota-exhausted (429)** — enable billing / raise quota |
| `GEMINI_MODEL` | Optional model override (default `gemini-2.0-flash`) | ⬜ optional |
| `ANTHROPIC_API_KEY` | Legacy assistant / lesson-gen fallback | ⬜ not set (optional) |
| `SHOPIFY_STORE_DOMAIN` / `SHOPIFY_ADMIN_TOKEN` / `SHOPIFY_WEBHOOK_SECRET` / `AFFILIATE_DISCOUNT_PERCENT` | Revenue + tiers | ❌ not set — **last step** |

## 3. Shopify (final step)
- [ ] Set the four Shopify env vars in production.
- [ ] Register `orders/create` + `orders/paid` webhooks against the **production** store → `/api/webhooks/shopify` with `SHOPIFY_WEBHOOK_SECRET`.
- [ ] Confirm a real order carrying a `WN-…` discount code appears in the `orders` table and lights up the dashboard/reporting.

## 4. Scheduled jobs
- [x] Vercel Cron calls `/api/cron/run` daily 06:00 UTC (tiering, lifecycle emails). Confirm it's firing in production.

## 5. QA sign-off (Part 7)
- [x] **Permission audit** — every audience-gated practitioner route filters through `hasAccess`: pathways, events, toolkit, pearls, homepage widgets. Media/community/leaderboard have no audience dimension. No gaps found.
- [x] **Empty states** — a zero-activity practitioner sees sensible empty states on learning, cpd, toolkit, resources, community, events, leaderboard (no broken pages).
- [x] **Rate limiting** — Ask the Expert capped at 30 queries/practitioner/hour (429 beyond). Consultation booking form is still a coming-soon stub (no form to rate-limit yet).
- [ ] **Mobile** — spot-checked at 375px in dev; do a final pass on real devices before go-live.
- [ ] **Error monitoring** — not wired to Sentry (needs a Sentry DSN/account). Errors are logged (`console.error`) and recorded in `ai_queries` / `automation_runs`. Add Sentry if desired: provide a `SENTRY_DSN` and wire `@sentry/nextjs`.

## 6. Test data to clean up before launch
- Prod test practitioners: henrietta / lucy (your Gmails), plus any `*-test@example.com` accounts created during verification (AI Test, Fallback Test, etc.). Delete via the Turso console.
- Any Content-Factory / manual drafts created while testing.
