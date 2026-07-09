# Wild Nutrition — Practitioner Onboarding Portal

Automated practitioner application pipeline: branded apply form → register
verification → auto-approve or flag → affiliate code + referral link →
SQLite record → welcome email → admin review queue.

## Quick start

```bash
npm install
cp .env.example .env.local   # set ADMIN_PASSWORD at minimum
npm run dev                  # http://localhost:3100
```

- `/apply` — public application form (Wild Nutrition branded)
- `/admin` — review queue (password from `ADMIN_PASSWORD`)

## How verification works

1. Applicant submits name, email, register (BANT/CNHC/NNA/ANP), membership
   number, and qualification status.
2. The matching register adapter performs ONE polite, rate-limited, name-based
   lookup against the register's public directory (identified User-Agent, 8s
   timeout). No register exposes an API or number-based search, so results are
   confidence-scored: `high` / `partial` / `none` / `unavailable`.
3. Decision engine:
   - qualified + high → **auto-approved**
   - anything else (partial, none, outage, student, duplicate) → **flagged**
     with a reason code and a one-click manual register search link for the
     reviewer.
4. Approval (automatic or via admin) generates `WN-SURNAME-XXXX`, creates a
   Shopify discount code, builds the `/discount/CODE?utm_…` referral link, and
   enrols the practitioner in the Mailchimp welcome journey.
5. If Shopify/Mailchimp are unreachable, the record stays approved with
   "sync pending" and a **Retry sync** button in admin. Every step is written
   to the audit trail.

## Mock mode vs live mode

Without credentials the app runs fully — external calls are mocked and logged:

| Integration | Env vars to go live |
|---|---|
| Shopify discount codes | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN` (Admin API token with `write_discounts`), optional `AFFILIATE_DISCOUNT_PERCENT` (default 10) |
| Mailchimp welcome sequence | `MAILCHIMP_API_KEY`, `MAILCHIMP_AUDIENCE_ID` — create merge fields `AFFCODE`, `AFFLINK` on the audience and a Customer Journey triggered by the `practitioner` tag |

Shopify Collabs has no write API; discount code + UTM link is the supported
programmatic equivalent.

## Practitioner dashboard

`/dashboard` — practitioners log in with a magic link (enter email → one-time
15-minute link → 30-day session). Only approved practitioners can log in. In
mock mode (no transactional email sender configured) the login link is shown
on screen and logged to the server console.

Referral links route through the portal (`{PORTAL_URL}/r/CODE`) so clicks are
counted locally, then redirect to the Shopify discount URL. Stats shown:
clicks, orders, conversion rate, and commission (`COMMISSION_PERCENT`, default
20%) — this month and all time. Orders/revenue come from the Shopify Admin API
when credentials exist, otherwise zeros (mock). Stats refresh every 60s
without a page reload and degrade to the last cached values (flagged as stale)
if Shopify is unreachable.

## AI protocol assistant

`/assistant` (practitioner login required) — enter a client profile in plain
language, get a suggested Wild Nutrition protocol plus a printable branded
client handout carrying the practitioner's referral code. Requires
`ANTHROPIC_API_KEY`; without it the page shows a setup notice.

Grounding: the entire markdown knowledge base in `knowledge/` is loaded into
the model's system prompt (with prompt caching), the model may only recommend
products from `knowledge/products/*.md` with label doses quoted verbatim, and
a post-generation check strips anything not found in the KB. The shipped
dossiers are **samples** — replace them with approved clinical content before
live use (each file is marked).

Safety: a deterministic pre-screen flags pregnancy, medications, minors and
serious conditions before the model runs; the model must emit safety flags and
defer to practitioner judgement / technical support; out-of-scope requests are
declined. Every query and output is logged to the `ai_queries` table and
visible in the admin "AI queries" tab for spot-checking.

## Educational hub

Content pipeline + practitioner learning library.

**Pipeline (offline):** drop source files (webinar transcripts, notes,
formulation docs, case studies — markdown/txt/PDF) into `content-sources/` and
run `npm run generate-lessons` (needs `ANTHROPIC_API_KEY`). Claude turns each
source into 1–4 microlearning lessons (title, 200–400-word summary, 3–5
takeaways, one multiple-choice quiz, topic tags) written to the review queue as
`draft` — **never auto-published**. Any clinical claim not traceable to the
source is flagged, by the model and by a deterministic post-scan, for the
reviewer. Shipped sample sources are marked and should be replaced.

**Review:** the admin "Lessons" tab shows each draft with its claim flags,
every field inline-editable, then Approve → published or Reject. Only published
lessons reach practitioners.

**Library (`/library`, practitioner login):** browse/search published lessons
by topic, take the interactive quiz self-check, and "Mark as complete". Each
practitioner's completed count (CPD tracking) appears on their dashboard, which
links straight to the library.

## Internal reporting

Admin-only (`/admin` → "Reporting" tab) — **not practitioner-facing**. One row per
practitioner combining referral revenue, portal engagement, education completion,
and derived tier/risk, sortable and filterable, with CSV export for review meetings.

- **Tier** (self-contained): Standard/Silver/Gold at £0/£1k/£3k rolling-12-month
  referred revenue.
- **Engagement score** (0–100): weighted blend of logins, referral clicks, lesson
  completions and AI-assistant usage. Logins are recorded on each magic-link verify.
- **Power user**: revenue > 0 and top 20% by referred revenue — an ambassador shortlist.
- **Churn risk**: approved, no referral in 60 days, and activity trending down.
- **Dormant**: no referral in 90 days.

All thresholds live in `SCORING` (`lib/reporting/scoring.ts`). Revenue comes from the
Shopify provider (mock = 0 without keys — engagement/education/logins/flags/CSV are
all real from local data regardless). The report is cached ~5 minutes server-side.
Export via `/api/admin/reporting/export`.

## Data

SQLite at `DB_PATH` (default `data/practitioners.db`). Tables: `practitioners`
(record, status, verification JSON, code/link, sync flag) and `events` (audit
log). WAL mode; safe for this single-writer workload.

## Tests

```bash
npm test
```

Covers the decision engine, code generation, data layer, register adapters
(fixture HTML), providers (mock + failure paths), pipeline, and API routes.

## Register terms of use

Lookups are deliberately minimal (one request per application, ≥1s apart,
identified UA). If a register objects or blocks, its adapter degrades to
`unavailable` and applications flag for manual review — the pipeline never
breaks. To disable automated lookup for a register entirely, make its
adapter's `lookup` return `unavailable` immediately.

## Branding

Fonts and palette are lifted from wildnutrition.com/pages/practitioner-community:
`Gestura, Georgia, serif` headings, `Basis, system-ui, sans-serif` body
(Gestura/Basis are Wild Nutrition's licensed fonts — no font files are bundled;
the site's own fallbacks render until deployed on their infrastructure), with
ink `#191919`, terracotta `#a45248`, cream `#f8f6f3`, sage `#d0d1ab`,
stone `#e6e3df`, forest `#3a4f41`.
