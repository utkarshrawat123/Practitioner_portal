# Unified Reporting Layer — Design Spec

**Date:** 2026-07-09
**Status:** Approved by user
**Extends:** practitioner-portal (onboarding, dashboard, AI assistant, education hub)

## Problem

The Wild Nutrition team has no single internal view of practitioner health. Data
is scattered across referral activity (clicks/orders/revenue), portal engagement,
education completion, and derived tier/lifecycle status. This builds an admin-only
reporting layer: one sortable/filterable row per practitioner with referred
revenue, engagement score, tier, dormancy + churn risk, and education completion,
plus a power-user flag (top ~20% by referred revenue) and CSV export for review
meetings. Internal decision-making tool — never practitioner-facing.

## Confirmed decisions

| Decision | Choice |
|---|---|
| Tier / lifecycle source | Computed self-contained in this layer (Prompt 5 tiering was never built). This becomes the single read-model. |
| Tier thresholds | Standard / Silver / Gold at £0 / £1,000 / £3,000 rolling-12-month referred revenue. |
| Engagement input | Add `login_events` logging on session verify; engagement = blend of logins, clicks, lesson completions, AI-assistant usage. |
| Churn rule | Approved AND no referral in 60 days AND activity falling (last-30d logins+clicks < prior-30d). |
| Dormant | No referral in 90 days. |
| Power-user | Revenue > 0 AND top 20% by rolling-12-month referred revenue (relative cohort pass). |
| Access | Admin-only, existing `/admin` password gate (`isAuthed`). |
| Email/keys | Revenue via existing Shopify provider (mock = 0 without keys). No new external services. |

## Revenue basis

All revenue figures (displayed "referred revenue", tier computation, power-user
percentile) use **rolling-12-month attributed revenue** for one consistent number.

## Architecture (additions)

```
lib/db.ts                       + login_events table; recordLogin(), loginStats(),
                                  clickWindows(), aiQueryCount() helpers; reporting reads
app/api/auth/verify/route.ts    + recordLogin() on successful session issue
lib/reporting/scoring.ts        SCORING config + pure fns: computeTier, engagementScore,
                                  isDormant, isChurnRisk, markPowerUsers
lib/reporting/signals.ts        ReferralDataProvider interface (shopify | mock);
                                  gatherSignals(practitioner, provider) → PractitionerSignals
lib/reporting/report.ts         buildReport(provider?) → { rows: ReportRow[]; summary }, 5-min cache
lib/reporting/csv.ts            toCsv(rows) → string (RFC-4180 escaping)
app/api/admin/reporting/route.ts        GET → { rows, summary } (admin-gated)
app/api/admin/reporting/export/route.ts GET → text/csv attachment (admin-gated)
components/AdminReporting.tsx    Reporting tab: summary chips, filters, sortable table, export
components/AdminDashboard.tsx    + "Reporting" tab
```

## Data model addition

```sql
login_events (
  id INTEGER PK,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

New db helpers:
- `recordLogin(practitionerId)` — insert a row (called from verify route).
- `loginStats(practitionerId)` → `{ last30, prior30, lastAt }` (counts in days 0–30 and 31–60; most-recent timestamp).
- `clickWindows(practitionerId)` → `{ last30, prior30, total, lastAt }`.
- `aiQueryCount(practitionerId, days)` → number.
- (reuse) `countCompletions`, existing click/order data.

## Signal provider

```ts
interface ReferralData { revenue12mo: number; orders12mo: number; lastReferralAt: string | null }
interface ReferralDataProvider { name: string; getReferralData(code: string): Promise<ReferralData> }
getReferralDataProvider(): ReferralDataProvider  // shopify if creds, else mock (zeros/null)
```
Shopify impl: Admin GraphQL orders on `discount_code:CODE` within the trailing 12
months, summed. Mock: `{0,0,null}`. Provider failure per practitioner → treated as
zeros + a `dataWarning: true` on the row; the build continues.

## Scoring (all constants in SCORING config)

```ts
SCORING = {
  tiers: [{slug:'gold',min:3000},{slug:'silver',min:1000},{slug:'standard',min:0}],
  engagement: { loginWeight:10, clickWeight:3, lessonWeight:5, aiWeight:4, cap:100 },
  dormantDays: 90,
  churnDays: 60,
  powerUserPercentile: 0.20,
};
computeTier(revenue) → 'standard'|'silver'|'gold'
engagementScore({logins30, clicks30, lessonsCompleted, aiQueries30})
  = min(cap, logins30*10 + clicks30*3 + lessonsCompleted*5 + aiQueries30*4)
isDormant(lastReferralAt, now) — null or > 90 days ago
isChurnRisk({status, lastReferralAt, logins30, clicks30, loginsPrior30, clicksPrior30}, now)
  = status==='approved' && noReferral60 && (logins30+clicks30) < (loginsPrior30+clicksPrior30)
markPowerUsers(rows) — sort by revenue desc; top ceil(20% of n) with revenue>0 get powerUser=true
```

## Report row

```ts
interface ReportRow {
  id; name; email; status; tier;
  referredRevenue; orders; clicks; conversionRate;  // conv = orders/clicks (0 if no clicks)
  engagementScore; lessonsCompleted;
  lastLoginAt; lastReferralAt;
  dormant; churnRisk; powerUser; dataWarning;
}
// summary: { total, powerUsers, churnRisk, dormant, byTier:{standard,silver,gold} }
```

`buildReport` gathers signals for every practitioner, computes per-row fields,
then runs `markPowerUsers` across the set, then the summary. Cached 5 minutes
(cleared for tests via `clearReportCacheForTests()`).

## API

- `GET /api/admin/reporting` → 200 `{ rows, summary }` | 401. Admin-gated.
- `GET /api/admin/reporting/export` → 200 `text/csv` with
  `Content-Disposition: attachment; filename="practitioner-report-<date>.csv"` | 401.

## UI — Reporting tab in /admin

Summary chips (total, power users, churn risk, dormant). Filter bar: tier select,
toggles (power user / churn risk / dormant), name search. Sortable table — click a
header to sort asc/desc on that column (revenue, engagement, tier, lessons, etc.).
Power-user rows carry a sage badge; churn-risk rows a terracotta marker; dataWarning
a small caption. "Export CSV" button hits the export route. Client-side sort/filter
over the fetched rows (small N). Brand tokens/classes from existing admin components.

## Error handling

- Per-practitioner provider failure → zeros + `dataWarning`, build continues.
- Both routes 401 without admin cookie.
- CSV: quote fields containing comma/quote/newline; double interior quotes.
- Login logging failure in verify must never block login (wrapped, best-effort).

## Testing (Vitest, TDD; no real API)

`engagementScore` maths + cap; `computeTier` boundaries (£999→standard, £1000→silver,
£3000→gold); `isDormant` at the 90-day edge; `isChurnRisk` (exactly 60 days; falling
vs rising; new practitioner not flagged); `markPowerUsers` (top-20% cohort, ties, tiny
N, all-zero → none); `buildReport` with injected provider (rows, summary, dataWarning
on provider throw); `toCsv` escaping; login_events helpers (window counts, recordLogin);
both API routes' gating + shapes; recordLogin called on verify.

## Out of scope (YAGNI)

- Building the Prompt-5 tiering automation (scheduled recalculation, tier emails).
- Historical backfill of logins (data accrues from deploy forward).
- Charts/time-series; server-side pagination (small practitioner set).
- Practitioner-facing exposure of any of this.
