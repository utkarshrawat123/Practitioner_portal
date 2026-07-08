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
