# Unified Reporting Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Admin-only read-model that combines referral, engagement, education, and derived tier/risk into one sortable/filterable per-practitioner table with power-user + churn flags and CSV export.

**Architecture:** Pure scoring engine + injectable signal provider feed a cached `buildReport()`. Two admin-gated API routes (JSON + CSV) and a "Reporting" tab in `/admin`. One small new table (`login_events`) written from the existing verify route.

**Tech Stack:** Existing app (Next.js 14, better-sqlite3, zod, Vitest). Revenue via the existing Shopify provider pattern (mock = 0 without keys).

**Spec:** `docs/superpowers/specs/2026-07-09-reporting-layer-design.md`

## Global Constraints

- Admin-only: every reporting route gated by `isAuthed` (401 otherwise). Never practitioner-facing.
- Revenue basis = rolling-12-month attributed revenue for display, tier, and power-user percentile.
- All tunable numbers live in the `SCORING` config in `lib/reporting/scoring.ts`.
- Provider failure per practitioner → zeros + `dataWarning`, build continues (never throws).
- Login logging in verify is best-effort — must never block a login.
- Tests never call the real API: inject a fake `ReferralDataProvider`; route tests stub `fetch`/use mock.
- Brand tokens/classes match existing `AdminDashboard.tsx`.

---

### Task 1: login_events table + engagement DB helpers

**Files:** Modify `lib/db.ts`; modify `app/api/auth/verify/route.ts`. Test `tests/login-events-db.test.ts`.

**Interfaces (produced from lib/db.ts):**
```ts
recordLogin(practitionerId: number): void
loginStats(practitionerId: number): { last30: number; prior30: number; lastAt: string | null }
clickWindows(practitionerId: number): { last30: number; prior30: number; total: number; lastAt: string | null }
aiQueryCount(practitionerId: number, days: number): number
```
Add `CREATE TABLE IF NOT EXISTS login_events (...)` to SCHEMA. Window logic: `last30` = created_at >= now-30d; `prior30` = created_at in [now-60d, now-30d). Use SQLite `datetime('now','-30 days')` comparisons. In verify route, after setting the session cookie, call `recordLogin(practitionerId)` wrapped in try/catch (best-effort).

TDD (`tests/login-events-db.test.ts`): seed a practitioner; `recordLogin` twice → `loginStats.last30` = 2, `lastAt` set; insert a login dated -45 days → counts in `prior30`, not `last30`; `clickWindows` splits recorded clicks by window (insert clicks at -5d and -45d → last30=1, prior30=1, total=2); `aiQueryCount(id, 30)` counts recent ai_queries only.

Commit: `feat: login event logging and windowed engagement DB helpers`

### Task 2: scoring engine (`lib/reporting/scoring.ts`)

**Interfaces:**
```ts
type TierSlug = 'standard'|'silver'|'gold'
const SCORING = { tiers:[...], engagement:{loginWeight:10,clickWeight:3,lessonWeight:5,aiWeight:4,cap:100},
  dormantDays:90, churnDays:60, powerUserPercentile:0.20 }
computeTier(revenue: number): TierSlug
engagementScore(i:{logins30;clicks30;lessonsCompleted;aiQueries30}): number
isDormant(lastReferralAt: string|null, now?: Date): boolean
isChurnRisk(i:{status;lastReferralAt;logins30;clicks30;loginsPrior30;clicksPrior30}, now?: Date): boolean
markPowerUsers<T extends {referredRevenue:number; powerUser:boolean}>(rows: T[]): void   // mutates
```
`computeTier` walks `tiers` (gold/silver/standard by min desc). `engagementScore` = min(cap, weighted sum). `isDormant` true if null or > dormantDays ago. `isChurnRisk` = status==='approved' && (lastReferralAt null or > churnDays ago) && (logins30+clicks30) < (loginsPrior30+clicksPrior30). `markPowerUsers`: count `n=rows.length`; `k=ceil(n*percentile)`; sort indices by revenue desc; the top k with revenue>0 get powerUser=true (stable on ties by keeping input order among equals).

TDD (`tests/reporting-scoring.test.ts`): tier at 999/1000/2999/3000; engagement cap and zero; dormant at exactly 90 days (>90 true); churn true for approved+no-ref-61d+falling, false when rising, false for brand-new (all zero windows), false when a referral was 30d ago; markPowerUsers over [5000,2000,0,0,100] with 20% → only the 5000 row (k=1, revenue>0); all-zero set → none flagged.

Commit: `feat: reporting scoring engine (tier, engagement, dormant, churn, power-user)`

### Task 3: signal provider + report builder

**Files:** Create `lib/reporting/signals.ts`, `lib/reporting/report.ts`. Test `tests/reporting-report.test.ts`.

**Interfaces:**
```ts
// signals.ts
interface ReferralData { revenue12mo:number; orders12mo:number; lastReferralAt:string|null }
interface ReferralDataProvider { name:string; getReferralData(code:string):Promise<ReferralData> }
getReferralDataProvider(): ReferralDataProvider   // shopify if SHOPIFY creds else mock ({0,0,null})
interface PractitionerSignals { referral:ReferralData; logins:{last30;prior30;lastAt};
  clicks:{last30;prior30;total;lastAt}; lessonsCompleted:number; aiQueries30:number; dataWarning:boolean }
gatherSignals(p:Practitioner, provider:ReferralDataProvider): Promise<PractitionerSignals>
// report.ts
interface ReportRow { id;name;email;status;tier;referredRevenue;orders;clicks;conversionRate;
  engagementScore;lessonsCompleted;lastLoginAt;lastReferralAt;dormant;churnRisk;powerUser;dataWarning }
interface ReportSummary { total;powerUsers;churnRisk;dormant;byTier:{standard;silver;gold} }
buildReport(provider?: ReferralDataProvider): Promise<{ rows:ReportRow[]; summary:ReportSummary }>
clearReportCacheForTests(): void
```
`gatherSignals`: call provider (catch → zeros + dataWarning true), read `loginStats`/`clickWindows`/`countCompletions`/`aiQueryCount`. `buildReport`: over `listPractitioners()` (all), gather + compute each row (conversionRate = orders/clicks rounded 1dp or 0), `markPowerUsers(rows)`, build summary, cache 5 min.

TDD: injected provider returning different revenue per code → rows carry revenue, tier, conversionRate; a provider that throws for one code → that row `dataWarning:true`, revenue 0, others fine; `markPowerUsers` applied (top row flagged); summary counts match; `clearReportCacheForTests` forces rebuild. Seed practitioners with clicks/lessons/logins to exercise engagement + churn + dormant.

Commit: `feat: signal aggregation and cached report builder`

### Task 4: CSV + API routes

**Files:** Create `lib/reporting/csv.ts`, `app/api/admin/reporting/route.ts`, `app/api/admin/reporting/export/route.ts`. Test `tests/reporting-csv.test.ts`, `tests/api-reporting.test.ts`.

**Interfaces:** `toCsv(rows: ReportRow[]): string` — header row + one line per row; quote any field containing `,` `"` or newline, doubling interior quotes; booleans as `yes`/`no`; nulls as empty.

Routes: `GET /api/admin/reporting` (isAuthed → 401 else `{rows,summary}`); `GET /api/admin/reporting/export` (isAuthed → 401 else `new NextResponse(csv, { headers: { 'Content-Type':'text/csv; charset=utf-8', 'Content-Disposition':'attachment; filename="practitioner-report-<YYYY-MM-DD>.csv"' } })`).

TDD: `toCsv` — a row with a comma in the name and a quote is escaped correctly; header present; boolean/null formatting. `api-reporting`: both routes 401 unauthed; authed reporting returns rows+summary (mock provider, seeded practitioner); authed export returns 200 with `text/csv` content-type and the practitioner's name in the body.

Commit: `feat: CSV serializer and admin reporting API (JSON + export)`

### Task 5: Reporting tab UI + verify + merge

**Files:** Create `components/AdminReporting.tsx`; modify `components/AdminDashboard.tsx` (add "Reporting" tab, same self-loading pattern as AI/Lessons tabs). Modify `README.md`.

UI: on load fetch `/api/admin/reporting`; summary chips; filter bar (tier `<select>`, checkboxes power-user/churn-risk/dormant, name search); sortable table (click header toggles asc/desc; sort state in component); power-user sage badge, churn-risk terracotta text, dataWarning caption; "Export CSV" anchor to `/api/admin/reporting/export`. Client-side filter+sort over fetched rows. Follows existing admin card/label/table classes (full code in repo; executor is this session).

Verify: `npm test && npm run build`; smoke on live server (both routes 401 without cookie; authed via admin cookie returns rows; export returns text/csv). Merge to main.

Commit: `feat: admin reporting dashboard tab with sort, filter, and CSV export`

## Self-review notes
Coverage: login logging (T1), engagement/tier/churn/dormant/power-user scoring (T2), all four data streams aggregated + cached (T3), CSV + admin-gated JSON/export APIs (T4), sortable/filterable UI + CSV button (T5). Types cross-checked (ReportRow/ReferralData/PractitionerSignals). Admin-gating + provider-failure-continues + best-effort-login constraints reflected in tasks. UI-code-in-repo deviation noted.
