# Wild Nutrition Practitioner Onboarding System — Design Spec

**Date:** 2026-07-08
**Status:** Approved by user
**Project folder:** `Wild Dash/practitioner-portal` (separate from `wild-dash`)

## Problem

Practitioners (nutritional therapists, functional medicine practitioners, students)
apply to join Wild Nutrition's Practitioner Community and are currently verified
manually by a human, which is slow. This system automates the pipeline: application
→ register verification → approval decision → affiliate code generation → record
storage → welcome email, with an admin view for human review of flagged cases.

## Confirmed decisions

| Decision | Choice |
|---|---|
| Verification method | Assisted-manual: automated name-based directory lookup with confidence scoring; auto-approve high confidence; flag the rest with reason + pre-filled manual search link. Pluggable adapter per register. |
| Affiliate platform | Shopify Collabs ecosystem — no write API exists, so generate a Shopify discount code via the Shopify Admin API + a UTM-tagged referral link (equivalent tracking). |
| Database | SQLite (better-sqlite3), single file, migrate-to-Postgres-friendly schema. |
| Email platform | Mailchimp — add approved practitioner to an audience with merge fields (code, link); a Mailchimp journey sends the welcome sequence. |
| Registers supported | BANT, CNHC, NNA, ANP (dropdown, extensible adapter registry). |
| Stack | Next.js 14 (App Router) + Tailwind + TypeScript, matching `wild-dash` conventions. Vitest for tests. |

External adapters (Shopify, Mailchimp) run in **mock mode** (payloads logged,
codes generated locally) until real credentials are provided via env vars:
`SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN`, `MAILCHIMP_API_KEY`,
`MAILCHIMP_AUDIENCE_ID`.

## Branding (extracted from wildnutrition.com/pages/practitioner-community)

- **Headings:** `Gestura, Georgia, serif` — site's exact declared stack.
- **Body/UI:** `Basis, system-ui, sans-serif` — site's exact declared stack.
- Gestura/Basis are Wild Nutrition's licensed fonts: we declare the same family
  names with the site's own fallbacks; no font files are bundled. Deployed on
  their infrastructure the real fonts resolve.
- **Palette:** ink `#191919` / `#222222`, terracotta accent `#a45248`, warm
  off-white `#f8f6f3`, sage `#d0d1ab`, stone `#e6e3df`, forest `#3a4f41`,
  white `#ffffff`.
- Tone/layout mirrors the practitioner-community page: serif hero, generous
  whitespace, terracotta CTAs, uppercase button labels.

## Architecture

Single Next.js app, three surfaces + one pipeline:

```
/apply            public branded application form
/api/apply        POST → runs verification pipeline → decision
/admin            password-protected review dashboard (env ADMIN_PASSWORD)
/api/admin/*      approve / reject / list endpoints
lib/
  db.ts           SQLite schema + access (better-sqlite3)
  pipeline.ts     orchestrates verify → decide → approve steps
  decision.ts     pure decision engine (rules below)
  registers/      one adapter per register + registry
    types.ts      RegisterAdapter interface
    bant.ts  cnhc.ts  nna.ts  anp.ts
  affiliates/     AffiliateProvider interface, shopify.ts, mock.ts
  email/          EmailProvider interface, mailchimp.ts, mock.ts
  codes.ts        affiliate code + referral link generation
```

### RegisterAdapter interface

```ts
interface RegisterAdapter {
  id: 'BANT' | 'CNHC' | 'NNA' | 'ANP';
  label: string;
  // single polite, rate-limited, name-based public directory lookup
  lookup(name: string, registerNumber: string): Promise<LookupResult>;
  // pre-filled directory search URL for one-click human verification
  manualSearchUrl(name: string): string;
}
interface LookupResult {
  confidence: 'high' | 'partial' | 'none' | 'unavailable';
  detail: string;          // human-readable evidence / error
}
```

Lookups are best-effort HTTP GETs against public search pages with an
identified User-Agent, ≥1 request/sec rate limit, and a short timeout. Any
failure degrades to `unavailable` (never crashes an application). If a register
later grants API access, only its adapter changes.

### Decision engine (pure function, fully unit-tested)

| Condition | Decision | Reason code |
|---|---|---|
| Qualified + `high` confidence match | auto-approve | `AUTO_MATCH` |
| Qualified + `partial` match | flag | `PARTIAL_MATCH` |
| Qualified + `none` | flag | `NO_MATCH` |
| Qualified + `unavailable` | flag | `DIRECTORY_UNAVAILABLE` |
| Student (any) | flag | `STUDENT_MANUAL` |
| Duplicate email or register number | flag | `DUPLICATE` |
| Invalid/missing fields | reject at validation | — |

### Approval pipeline (auto-approve or admin click; idempotent)

1. Generate unique code: `WN-{SURNAME≤6}-{4-char base32}` (collision-checked).
2. Affiliate provider: create Shopify discount code (mock logs payload).
3. Build referral link:
   `https://www.wildnutrition.com/discount/{CODE}?utm_source=practitioner&utm_medium=referral&utm_campaign={CODE}`.
4. Persist code/link/status on the record.
5. Email provider: upsert Mailchimp audience member with merge fields
   `AFFCODE`, `AFFLINK` + tag `practitioner` (journey trigger). Mock logs payload.
6. Append audit event.

Steps 2 and 5 are external: failure marks the record `approved` with a
`pending_sync` flag and an audit event, retryable from admin — external outages
never lose an approval.

## Data model (SQLite)

```sql
practitioners (
  id INTEGER PK, name TEXT, email TEXT UNIQUE, register_body TEXT,
  register_number TEXT, qualification_status TEXT,      -- qualified|student
  tier TEXT DEFAULT 'standard',
  status TEXT,            -- pending|approved|flagged|rejected
  verification_json TEXT, -- {confidence, reasonCode, detail, manualSearchUrl}
  affiliate_code TEXT, affiliate_link TEXT,
  pending_sync INTEGER DEFAULT 0,
  created_at TEXT, decided_at TEXT, decided_by TEXT     -- 'system'|'admin'
)
events (
  id INTEGER PK, practitioner_id INTEGER, type TEXT, detail TEXT, created_at TEXT
)
```

## Admin view

- Login: single password from `ADMIN_PASSWORD` env var (cookie session).
- Queue tabs: Flagged / Auto-approved / All, with reason codes visible.
- Detail panel: application fields, verification evidence, one-click
  pre-filled register search link, Approve / Reject buttons, audit trail.
- Approve on a flagged record runs the same approval pipeline.

## Error handling principles

- External calls: wrapped, timed out, degraded to flag/pending_sync — never 500
  the applicant.
- Validation with zod at the API boundary; friendly form errors.
- All decisions and external payloads written to the audit log.

## Testing

Vitest, TDD. Unit: decision engine (every rule), code generator (format,
collisions), referral-link builder, adapters against fixture HTML/mocked fetch.
Integration: POST /api/apply happy path + flag paths against a temp SQLite db.

## Out of scope (YAGNI)

- Tiers beyond `standard` (column exists, no logic).
- Portal login for practitioners (email says "portal login instructions" —
  content configurable, portal itself is Wild Nutrition's existing account flow).
- Automated re-verification / register expiry sweeps.
- Multi-admin roles.
