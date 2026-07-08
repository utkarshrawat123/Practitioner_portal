# Practitioner Self-Serve Dashboard — Design Spec

**Date:** 2026-07-09
**Status:** Approved by user
**Extends:** 2026-07-08-practitioner-onboarding-design.md (same app, same repo)

## Problem

Approved practitioners have no way to see their referral code, link, or
performance. They need a self-serve login dashboard showing their affiliate
assets, live stats, tier, and profile — clean and clinical, mobile-responsive,
matching wildnutrition.com/pages/practitioner-community branding exactly
(same Tailwind tokens already in the app: Gestura/Basis stacks, ink/terracotta/
cream/sage/stone/forest palette).

## Confirmed decisions

| Decision | Choice |
|---|---|
| Auth | Passwordless magic links (15-min single-use token → 30-day HMAC-signed session cookie). Shopify customer-account OAuth deliberately deferred: needs store credentials + admin config we don't have; auth is isolated in one module so it can be swapped later. |
| Click tracking | Portal redirect: referral links become `{PORTAL_URL}/r/{CODE}`; the route records the click then 302s to `wildnutrition.com/discount/{CODE}` + UTMs. Shopify cannot report link clicks. |
| Commission | 20% of attributed order revenue, `COMMISSION_PERCENT` env (display-time calculation, changeable any time). |
| Stats source | Shopify Admin API orders filtered by discount code (live), mock returns zeros (drives empty state). Clicks/conversion from local `clicks` table. |
| Tier | Read existing `tier` column, display with "tiering criteria coming soon" note. No tier logic (Prompt 5 placeholder). |

## New env vars

`SESSION_SECRET` (HMAC key; required in prod, dev default), `PORTAL_URL`
(default `http://localhost:3100`), `COMMISSION_PERCENT` (default 20).

## Architecture (additions to existing app)

```
lib/
  practitionerAuth.ts   HMAC session cookie sign/verify + request → Practitioner
  magicLink.ts          MagicLinkSender interface, mock sender, requestLoginLink()
  stats.ts              StatsProvider (shopify | mock), computeStats(), 60s cache
  db.ts                 + auth_tokens, clicks tables and access functions
  codes.ts              referralLink() → portal /r/ URL; shopifyDiscountUrl() for redirect target
app/
  r/[code]/route.ts     click recorder + 302 redirect (never errors; unknown code → homepage)
  api/auth/request-link POST {email} → always 200; devLink in mock mode only
  api/auth/verify       GET ?token= → set session cookie, redirect /dashboard
  api/auth/logout       POST → clear cookie
  api/me                GET → profile + code + link + tier (session-gated)
  api/me/stats          GET → stats JSON (session-gated)
  dashboard/page.tsx    login screen or dashboard
components/
  DashboardApp.tsx      client component: login, cards, copy buttons, 60s polling
```

## Data model additions

```sql
auth_tokens (
  token TEXT PK,                 -- 32 random bytes hex
  practitioner_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,      -- now + 15 min
  used_at TEXT                   -- single-use
);
clicks (
  id INTEGER PK,
  practitioner_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

Both created via `CREATE TABLE IF NOT EXISTS` in the existing schema block —
existing databases upgrade on next open.

## Auth flow

1. `POST /api/auth/request-link {email}` — respond 200 regardless (no email
   enumeration). If the email belongs to an **approved** practitioner, create a
   token and hand the login URL to the `MagicLinkSender`. Mock sender logs it
   and (mock mode only) returns it as `devLink` in the response. Live sender is
   a later drop-in (Mailchimp marketing API cannot send transactional email —
   will be Mandrill/SMTP when credentials exist).
2. `GET /api/auth/verify?token=…` — valid + unexpired + unused → mark used,
   set `wn_session` cookie (`{id}.{exp}.{hmac-sha256(id.exp, SESSION_SECRET)}`,
   httpOnly, SameSite=Lax, 30 days), redirect `/dashboard`. Invalid → redirect
   `/dashboard?error=expired`.
3. Session read on every `/api/me*` call; tampered/expired cookie → 401 →
   UI shows login screen.

## Stats

`computeStats(practitioner, provider)`:

- clicks this month / all time from `clicks` (SQLite `strftime('%Y-%m')`).
- orders + revenue this month / all time from `StatsProvider.getOrderStats(code)`
  — Shopify GraphQL `orders(query: "discount_code:CODE")`, paginated, summed;
  mock returns zeros.
- commission = revenue × COMMISSION_PERCENT / 100 (month + all-time).
- conversion rate = allTimeOrders / allTimeClicks (0 when no clicks).
- 60s in-memory cache per code. Provider failure → serve last cached value
  with `stale: true`; no cache → zeros with `stale: true`. UI shows a quiet
  "live stats temporarily unavailable" note when stale.
- Client polls `/api/me/stats` every 60s — no page reload.

## Dashboard UI

Brand-identical to the practitioner-community page (existing tokens only —
no new colours or fonts). Clinical layout:

- **Referral assets card:** code (large, Gestura, terracotta) + full link,
  each with one-click copy (clipboard API, "Copied ✓" feedback).
- **Stats grid:** clicks, orders, conversion rate, commission — each split
  this month / all time. Skeleton placeholders while loading. Empty state when
  no clicks and no orders: "Share your link to start earning" with the copy
  buttons repeated.
- **Tier card:** value from `tier` column (currently `standard`), caption
  "Tiering criteria coming soon".
- **Profile card:** name, email, register body + number, qualification status,
  sign-up date. Read-only.
- Responsive: single column < md, two-column grid ≥ md. Logout link.

## Error handling

- `/r/[code]`: unknown/missing code → 302 to wildnutrition.com homepage.
  DB write failure → still redirect (click loss is acceptable; customer flow
  is not).
- All session-gated APIs return 401 JSON; client falls back to login screen.
- Stats endpoint never 500s for provider failures (stale-flag path).

## Testing

Vitest, same harness: token lifecycle (create/consume/expiry/single-use),
cookie sign/verify/tamper, request-link enumeration-safety + approved-only,
redirect route (click recorded, 302 target, unknown code), stats maths
(commission, month boundary via injected created_at, zero-division), stale
fallback, /api/me + /api/me/stats auth gating, updated referralLink format.

## Out of scope (YAGNI)

- Live magic-link email sender (interface + mock only until credentials).
- Tier logic (Prompt 5), payouts, CSV export, multi-device session management.
- Shopify customer-account OAuth (module swap later).
