# Practitioner-to-Practitioner Referral Network — "Refer a Colleague" (design)

**Date:** 2026-08-03
**Status:** Approved design, ready for implementation plan.
**Purpose:** Drive organic growth of the practitioner community. An approved practitioner invites a
colleague via a unique link; when that colleague joins **and makes their first paid sale** (a Patient
Cart that is paid, i.e. money to Wild Nutrition), the referrer earns a **£50 bonus**, tracked in-app as
*referral earnings*. A new `/referrals` page shows each referral moving through four stages: **Signed up
→ First purchase completed → Referral completed → Added to earnings.**

Built as a **new layer on top of existing plumbing** — it reuses the affiliate code as the invite code and
the existing `orders`-table "first paid sale" signal as the qualifying event. No changes to how existing
commerce/commission/auth behave.

---

## 1. Goal & scope

**In scope**
- A practitioner-facing **`/referrals`** page: the practitioner's unique invite link (copy button),
  total referral earnings (credited + pending), and a list of their referrals, each with a 4-stage tracker.
- **Invite link** attribution: `/apply?ref=<affiliateCode>` pre-fills an optional "Referred by" code box on
  the apply form; on submit the new practitioner is linked to the referrer.
- A **referral state machine** (`practitioner_referrals` table) capturing the lifecycle and the £50 award.
- **Automatic, idempotent bonus award**: when the referred practitioner's first qualifying order is recorded,
  the referral advances to completed/credited and £50 lands in the referrer's *referral earnings*. No admin
  approval gate.
- A small **dashboard card** (referral earnings + count → link to `/referrals`).
- A **light, read-only admin view** listing all referrals + statuses + total bonuses paid (oversight only).
- Mobile-friendly UI consistent with the responsive pass shipped 2026-08-02 (stage tracker stacks on mobile).

**Out of scope (deferred, easy to add later on this foundation)**
- Real money payout / withdrawal of referral earnings (tracked in-app only, like existing mock commission).
- Refund/chargeback clawback of an awarded bonus (v1 award is one-time and final).
- Email-based invitations, multi-tier / chained referrals, referral expiry, per-practitioner caps,
  admin approval of individual bonuses.

**Decisions locked with the user (2026-08-03):**
1. **Invite method** = unique invite link (`/apply?ref=<code>`) + optional manual code box as fallback.
2. **Bonus trigger** = automatic on the referred practitioner's first paid sale (no admin sign-off).
3. **Payout nature** = tracked in-app as *referral earnings* (no real bank transfer).

---

## 2. Terminology & the four stages

A **referral** is the relationship between a **referrer** (the inviting practitioner) and a **referee** (the
invited practitioner). Its `status` column drives the visible stage tracker:

| Stage (UI label)          | `status` value | Set when… |
|---------------------------|----------------|-----------|
| Signed up                 | `signed_up`    | Referee applies via the link **and is approved** (auto-approve or admin approval). |
| First purchase completed  | `first_sale`   | Referee's **first qualifying order** is recorded (a paid Patient Cart → `orders` row). |
| Referral completed        | `completed`    | The referral qualifies for the bonus (same transaction as `first_sale`). |
| Added to earnings         | `credited`     | £50 stamped onto the referral and reflected in the referrer's referral-earnings total. |

Extra internal state (not a visible stage): `invited` — the referee applied via the link but is **not yet
approved** (flagged/pending). It becomes `signed_up` when they are approved, or is left dangling if rejected.

**On the automatic path, `first_sale → completed → credited` happen in one transaction.** The four stages are
a lifecycle the UI renders as a stepper; a referral typically dwells at `signed_up` (referee hasn't sold yet)
and then completes fully on the first paid sale. This matches the user's requested stage list exactly.

---

## 3. Data model

New migration **`017_practitioner_referrals`** (append-only, following `lib/migrations.ts` convention).

**New table `practitioner_referrals`:**
```
id                  INTEGER PRIMARY KEY
referrer_id         INTEGER NOT NULL  → practitioners(id)   -- who invited
referred_id         INTEGER           → practitioners(id)   -- the invited practitioner (NULL until signup)
referred_email      TEXT                                     -- captured at apply time (dedupe/help)
invite_code         TEXT NOT NULL                            -- the referrer's affiliate_code used to attribute
status              TEXT NOT NULL DEFAULT 'invited'          -- invited|signed_up|first_sale|completed|credited
qualifying_order_id TEXT                                     -- the orders.order_id that triggered the award
bonus_amount        REAL DEFAULT 0                           -- £ credited (0 until credited)
currency            TEXT DEFAULT 'GBP'
signed_up_at        TEXT
first_sale_at       TEXT
completed_at        TEXT
credited_at         TEXT
created_at          TEXT DEFAULT (datetime('now'))
```
Indexes: `idx(referrer_id)`, plus a `UNIQUE(referred_id)` index. SQLite/libSQL treats NULLs as distinct in a
UNIQUE index, so multiple still-`invited` rows (referred_id NULL) coexist fine, while any *signed-up* referee
(non-NULL referred_id) can appear at most once. One-referral-per-referee is **also** enforced in code before
insert, so the constraint is defence-in-depth, not the sole guard.

**New column on `practitioners`:** `referred_by_practitioner_id INTEGER` (nullable) — the referrer, set once at
apply time. Denormalised for cheap lookups in the award path.

Rationale: a dedicated table (not overloading the customer-affiliate `orders`/`clicks` tables) keeps the P2P
network cleanly separated, gives a natural home for one-time idempotent crediting, and models the stages as
first-class state rather than deriving them on every read.

---

## 4. Attribution flow (invite link → signup)

1. **`/referrals`** shows the practitioner their invite link `${PORTAL_URL}/apply?ref=<their affiliateCode>` with
   a copy button. (Reuses the existing `affiliate_code`; no second code to mint.)
2. A colleague opens the link. **`ApplyForm`** reads the `ref` query param and shows an optional
   **"Referred by (code)"** field, pre-filled and editable. Absent/blank ⇒ a normal, unreferred application.
3. **`POST /api/apply`** accepts an optional `referredByCode`. `processApplication` resolves it via
   `getPractitionerByAffiliateCode(code)`:
   - Valid, approved, and **not the applicant themselves** ⇒ store `referred_by_practitioner_id` on the new row
     and create a `practitioner_referrals` row:
     - applicant approved on apply ⇒ `status: signed_up` (+ `signed_up_at`, `referred_id`).
     - applicant flagged/pending ⇒ `status: invited` (linked to `referred_email`; `referred_id` filled when they
       are later approved).
   - Invalid / self / unapproved referrer ⇒ silently ignored (application proceeds normally; never blocks signup).
4. **On later approval** (admin approves a flagged referee, `approvePractitioner`) ⇒ any matching `invited`
   referral for that email/id flips to `signed_up`.

**Guards (all enforced server-side):** self-referral blocked — the applicant can't use a `ref` code whose referrer
shares their email (and, post-signup, their id); referrer must be `approved`; at most one referral per referee
(idempotent create); the `ref` code is resolved and validated server-side (the client-sent value is advisory only).

---

## 5. The bonus engine (automatic, idempotent, one-time)

Single choke-point so every sale path is covered: extend the existing **`recordOrder(order)`** flow. `recordOrder`
is already called by the Patient Carts pay API (`app/api/pay/[token]/route.ts`) and the Shopify webhook, so both
present and future sale sources are covered without touching callers.

After an order is upserted, call **`maybeAwardReferralBonus(referredPractitionerId, order)`**:
1. Look up the practitioner's `referred_by_practitioner_id`; if none, return.
2. Load their `practitioner_referrals` row; if missing or already `status: credited`, return (idempotent).
3. If this is their **first qualifying order** (any recorded `orders` row for them; a paid cart qualifies), advance
   the referral in one transaction: set `status: credited`, `first_sale_at`/`completed_at`/`credited_at = now`,
   `qualifying_order_id = order.orderId`, `bonus_amount = REFERRAL_BONUS_GBP` (default **50**, parsed with the same
   robust helper as `pct()` so an empty/invalid env falls back to 50).
4. Skip if referrer or referee is not approved, or self-referral (defensive — should never occur past §4 guards).

**Idempotency:** guarded by `status != 'credited'` + `unique(referred_id)`; replaying a webhook, paying multiple
carts, or refunds never double-award. The award is derived from the **first** qualifying order only.

**Referral earnings totals:** `referralEarnings(referrerId)` returns `{ creditedTotal, pendingCount }` where
credited = Σ `bonus_amount` of `credited` rows and pending = referrals not yet `credited`. Surfaced on `/referrals`
and the dashboard card. Kept **separate** from customer-affiliate commission (distinct line item), not merged into
`computeStats` commission.

---

## 6. Practitioner UI — `/referrals`

Server shell (`app/referrals/page.tsx`, redirects non-approved to `/dashboard`, mirrors `/carts`) + client
`components/ReferralsApp.tsx`. Nav link "Refer & Earn" added to `PRACTITIONER_NAV` in `SiteHeader.tsx`.

Layout:
```
Refer a Colleague
Grow the community — earn £50 when a colleague you invite makes their first sale.

Your invite link
[ https://…/apply?ref=WN-SMITH-AB12 ]   [ Copy link ]

Referral earnings:   £150 credited     ·     2 pending

Your referrals
┌──────────────────────────────────────────────────────────┐
│ Dr. A. Jones                                      £50  ✓   │
│ ●─Signed up──●─First purchase──●─Completed──●─Added        │
├──────────────────────────────────────────────────────────┤
│ Sam Patel                                     pending      │
│ ●─Signed up──○─First purchase──○─Completed──○─Added        │
└──────────────────────────────────────────────────────────┘
```
- 4-stage horizontal stepper per referral (filled ● = reached, hollow ○ = not yet). **Stacks vertically on
  mobile** (`min-w-0`, responsive stepper), consistent with the 2026-08-02 responsive pass.
- Empty state: explains how it works + shows the invite link prominently.
- Brand tokens (ink/terracotta/forest/cream), matches existing practitioner pages.

**APIs (practitioner, `getSessionPractitioner` + approved):**
- `GET /api/me/referrals` → `{ inviteLink, earnings: { creditedTotal, pendingCount }, referrals: [...] }`.
  Referral rows expose referee display name (or email for `invited`), status, bonus_amount, timestamps.

---

## 7. Dashboard card & admin view

**Dashboard** (`DashboardApp`): a compact "Refer a colleague" card — total referral earnings + referral count,
CTA linking to `/referrals`. Additive; no change to existing commission/stat cards.

**Admin** (light, read-only) — a new "Referrals" section card in the admin console (`AdminDashboard` GROUPS,
under "Insights and ops"), rendering `components/AdminReferrals.tsx`:
- Table: referrer, referee (or invited email), status, bonus, dates.
- Summary: total referrals, total £ credited.
- **Read-only** — crediting is automatic; no approval controls. Mobile: wrapped in `overflow-x-auto` (matches the
  admin-table pattern from 2026-08-02).
- API `GET /api/admin/referrals` (`isAuthed`-gated).

---

## 8. Config & environment

- **`REFERRAL_BONUS_GBP`** (optional, default **50**) — the per-referral bonus, read at call-time via the robust
  numeric parser (empty/NaN/≤0 ⇒ default 50), mirroring `COMMISSION_PERCENT`/`pct()`.
- No other new env. Works fully in the current mock/demo mode (Patient Carts mock-pay drives the qualifying sale).
- `PORTAL_URL` (already set) builds the invite link.

---

## 9. Edge cases

- **Self-referral:** blocked at apply (id + email match) and defensively in the award path.
- **Referee flagged/pending then approved:** referral sits `invited` → becomes `signed_up` on approval.
- **Referee rejected:** referral remains `invited`/dangling, never credits.
- **Referrer later rejected/unapproved:** award path skips (must be approved to earn).
- **Multiple carts / webhook replays / refunds:** one-time award guaranteed by `status`/unique guards.
- **Invalid or missing `ref` code:** application proceeds as a normal unreferred signup (never blocks).
- **Referral link shared to an existing/duplicate email:** apply's existing `DuplicateEmailError` path is unchanged;
  no referral row created for a duplicate.

---

## 10. Testing (TDD, Vitest, keep suite green)

- **State machine / DB:** `createReferralOnSignup`, transitions `invited→signed_up`, `maybeAwardReferralBonus`
  first-sale detection, idempotency (no double-credit on replay/second cart), self-referral skip, `referralEarnings`
  totals.
- **Pipeline:** `processApplication` with a valid/invalid/self `referredByCode`; approval flipping `invited→signed_up`.
- **APIs:** `GET /api/me/referrals` shape + auth; `POST /api/apply` with `referredByCode`; `GET /api/admin/referrals`
  auth gate; the pay flow crediting a referral end-to-end (paid cart → £50 credited).
- **Guards:** empty/invalid `REFERRAL_BONUS_GBP` falls back to 50.
- Browser-verify on mobile + desktop: invite link copy, apply-with-ref, stage tracker rendering, dashboard card,
  admin list (no overflow).

---

## 11. Files touched (anticipated)

- **New:** `app/referrals/page.tsx`, `components/ReferralsApp.tsx`, `components/AdminReferrals.tsx`,
  `app/api/me/referrals/route.ts`, `app/api/admin/referrals/route.ts`, referral helpers in `lib/referrals.ts`.
- **Edited (additive):** `lib/migrations.ts` (017), `lib/db.ts` (referral helpers + `recordOrder` hook +
  `referred_by_practitioner_id`), `lib/pipeline.ts` (`referredByCode` on apply + approval flip),
  `app/api/apply/route.ts` (accept `referredByCode`), `components/ApplyForm.tsx` (ref field),
  `components/SiteHeader.tsx` (nav link), `components/DashboardApp.tsx` (card),
  `components/AdminDashboard.tsx` (admin section card).
- **No changes** to auth, existing commission logic, or the commerce provider seam.
```
