# Practitioner Referral Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an approved practitioner invite a colleague via a unique link and earn a £50 in-app bonus, automatically, when that colleague makes their first paid sale — surfaced on a `/referrals` page with a 4-stage tracker.

**Architecture:** A new `practitioner_referrals` table models the referral lifecycle (`invited → signed_up → first_sale → completed → credited`). Attribution happens at apply-time via `?ref=<affiliateCode>`. The £50 is awarded automatically and idempotently from the existing `recordOrder` choke-point (which every paid Patient Cart already hits). Referral earnings are tracked in-app, separate from customer-affiliate commission. All new data helpers live in `lib/db.ts` (consistent with patient-carts/presence), so the `recordOrder` hook needs no cross-module import.

**Tech Stack:** Next.js 14 App Router, TypeScript, Turso/libSQL (raw parameterised SQL, no ORM), zod, Vitest, Tailwind, lucide-react.

## Global Constraints

- Every `lib/db.ts` function is `async`; use the private `run`/`one`/`all`/`num` helpers and `rowToPractitioner`. Tests set `process.env.DB_PATH` to a temp file and call `resetDbForTests()` in `afterEach`.
- API route files export `const dynamic = 'force-dynamic'`. Practitioner routes: `getSessionPractitioner(req)` + require `status === 'approved'` → else 401 `{error:'Unauthorised'}`. Admin routes: `if (!isAuthed(req)) return 401 {error:'Unauthorised'}`.
- Validate request bodies with **zod**; wrap `req.json()` in try/catch → 400 on bad body.
- TDD: failing test first, then implement. Keep `npm test` green (currently **319 passing**).
- Migrations are append-only in `lib/migrations.ts` as `{ id, sql }`; new id is `017_practitioner_referrals`.
- Brand Tailwind tokens: `ink #191919`, `ink2`, `terracotta #a45248`, `cream #f8f6f3`, `sage #d0d1ab`, `stone #e6e3df`, `forest #3a4f41`; `font-heading`. Practitioner containers `mx-auto max-w-5xl px-6 py-10`. Mobile-safe: grid/flex items that hold wide content get `min-w-0`; wide tables get an `overflow-x-auto` wrapper.
- **Never** reference `care@wildnutrition.com`. Contact is `utkarshrawatofficial@gmail.com`.
- Bonus amount: env `REFERRAL_BONUS_GBP`, default **50**, parsed so empty/NaN/≤0 falls back to 50.

**Refinements vs spec (2026-08-03 design):** (1) The spec's `practitioners.referred_by_practitioner_id` column is **dropped** — the `practitioner_referrals.referred_id` fully captures the relationship, so the column is redundant. (2) `referred_id` is always set at creation (the applicant always has a practitioner row, even when flagged), so there are no NULLs and `UNIQUE(referred_id)` is a clean guard. (3) The award path looks up the referral by `referred_id` (not the dropped column). All new referral helpers live in `lib/db.ts` (not a separate `lib/referrals.ts`) so `recordOrder` can call the award function without a circular import.

---

### Task 1: Migration + referral row type & mapper

**Files:**
- Modify: `lib/migrations.ts` (append migration `017_practitioner_referrals`)
- Modify: `lib/db.ts` (add `ReferralRow` interface + `rowToReferral` mapper near the other interfaces/mappers)
- Test: `tests/referrals-db.test.ts`

**Interfaces:**
- Produces: `ReferralRow` (below); table `practitioner_referrals`.

```ts
export interface ReferralRow {
  id: number;
  referrerId: number;
  referredId: number;
  referredEmail: string;
  inviteCode: string;
  status: 'invited' | 'signed_up' | 'first_sale' | 'completed' | 'credited';
  qualifyingOrderId: string | null;
  bonusAmount: number;
  currency: string;
  signedUpAt: string | null;
  firstSaleAt: string | null;
  completedAt: string | null;
  creditedAt: string | null;
  createdAt: string;
}
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/referrals-db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-referrals-db-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

it('migration 017 creates practitioner_referrals with expected columns', async () => {
  const { execForTests } = await import('@/lib/db');
  const rows = await execForTests(`PRAGMA table_info(practitioner_referrals)`);
  const cols = rows.map((r: any) => r.name);
  expect(cols).toEqual(expect.arrayContaining([
    'id', 'referrer_id', 'referred_id', 'referred_email', 'invite_code', 'status',
    'qualifying_order_id', 'bonus_amount', 'currency', 'signed_up_at', 'first_sale_at',
    'completed_at', 'credited_at', 'created_at',
  ]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/referrals-db.test.ts -t "migration 017"`
Expected: FAIL (no such table `practitioner_referrals`).

- [ ] **Step 3: Append the migration**

In `lib/migrations.ts`, add as the last entry of the `MIGRATIONS` array (after `016_patient_carts`):

```ts
  {
    id: '017_practitioner_referrals',
    sql: `
CREATE TABLE IF NOT EXISTS practitioner_referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id INTEGER NOT NULL REFERENCES practitioners(id),
  referred_id INTEGER NOT NULL REFERENCES practitioners(id),
  referred_email TEXT NOT NULL,
  invite_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited',
  qualifying_order_id TEXT,
  bonus_amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  signed_up_at TEXT,
  first_sale_at TEXT,
  completed_at TEXT,
  credited_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON practitioner_referrals(referrer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_referred ON practitioner_referrals(referred_id);
`,
  },
```

- [ ] **Step 4: Add the row mapper in `lib/db.ts`**

Place near `rowToPractitioner` (or the other `rowTo*` mappers):

```ts
function rowToReferral(r: Row): ReferralRow {
  return {
    id: num(r.id),
    referrerId: num(r.referrer_id),
    referredId: num(r.referred_id),
    referredEmail: r.referred_email as string,
    inviteCode: r.invite_code as string,
    status: r.status as ReferralRow['status'],
    qualifyingOrderId: (r.qualifying_order_id as string | null) ?? null,
    bonusAmount: num(r.bonus_amount),
    currency: (r.currency as string) ?? 'GBP',
    signedUpAt: (r.signed_up_at as string | null) ?? null,
    firstSaleAt: (r.first_sale_at as string | null) ?? null,
    completedAt: (r.completed_at as string | null) ?? null,
    creditedAt: (r.credited_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}
```

Add the `ReferralRow` interface (from the Interfaces block above) near the top with the other exported interfaces.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/referrals-db.test.ts -t "migration 017"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/migrations.ts lib/db.ts tests/referrals-db.test.ts
git commit -m "feat(referrals): migration 017 practitioner_referrals + row type"
```

---

### Task 2: Referral CRUD + earnings helpers

**Files:**
- Modify: `lib/db.ts` (add referral helper functions)
- Test: `tests/referrals-db.test.ts` (extend)

**Interfaces:**
- Consumes: `ReferralRow`, `insertApplication`, `markApproved` (existing) for test seeding.
- Produces:
  - `createReferral(opts: { referrerId: number; referredId: number; referredEmail: string; inviteCode: string; approved: boolean }): Promise<void>` — inserts a row; `status='signed_up'` (+`signed_up_at`) when `approved`, else `'invited'`. Idempotent via `INSERT OR IGNORE` on the unique `referred_id`.
  - `getReferralByReferredId(referredId: number): Promise<ReferralRow | null>`
  - `markReferralSignedUp(referredId: number): Promise<void>` — flips `invited → signed_up` (no-op otherwise).
  - `listReferralsByReferrer(referrerId: number): Promise<ReferralView[]>`
  - `referralEarnings(referrerId: number): Promise<{ creditedTotal: number; pendingCount: number }>`
  - `ReferralView` = `ReferralRow & { refereeName: string; refereeStatus: string }`

```ts
export interface ReferralView extends ReferralRow {
  refereeName: string;
  refereeStatus: string;
}
```

- [ ] **Step 1: Write the failing tests**

Append to `tests/referrals-db.test.ts`:

```ts
async function seedApproved(email: string) {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name: `Prac ${email}`, email, registerBody: 'BANT', registerNumber: '12345', qualificationStatus: 'qualified',
  });
  await markApproved(p.id, { affiliateCode: `WN-${p.id}-AB2C`, affiliateLink: 'http://x', pendingSync: false, decidedBy: 'system' });
  return p;
}

it('createReferral (approved) is signed_up and readable by referrer + referred', async () => {
  const db = await import('@/lib/db');
  const referrer = await seedApproved('ref@example.com');
  const referred = await seedApproved('new@example.com');
  await db.createReferral({ referrerId: referrer.id, referredId: referred.id, referredEmail: 'new@example.com', inviteCode: 'WN-CODE', approved: true });

  const row = await db.getReferralByReferredId(referred.id);
  expect(row?.status).toBe('signed_up');
  expect(row?.signedUpAt).toBeTruthy();

  const list = await db.listReferralsByReferrer(referrer.id);
  expect(list).toHaveLength(1);
  expect(list[0].refereeName).toContain('new@example.com');
});

it('createReferral (not approved) is invited; markReferralSignedUp flips it', async () => {
  const db = await import('@/lib/db');
  const referrer = await seedApproved('ref2@example.com');
  const referred = await seedApproved('new2@example.com');
  await db.createReferral({ referrerId: referrer.id, referredId: referred.id, referredEmail: 'new2@example.com', inviteCode: 'WN-CODE', approved: false });
  expect((await db.getReferralByReferredId(referred.id))?.status).toBe('invited');
  await db.markReferralSignedUp(referred.id);
  expect((await db.getReferralByReferredId(referred.id))?.status).toBe('signed_up');
});

it('createReferral is idempotent per referred_id', async () => {
  const db = await import('@/lib/db');
  const referrer = await seedApproved('ref3@example.com');
  const referred = await seedApproved('new3@example.com');
  await db.createReferral({ referrerId: referrer.id, referredId: referred.id, referredEmail: 'new3@example.com', inviteCode: 'C', approved: true });
  await db.createReferral({ referrerId: referrer.id, referredId: referred.id, referredEmail: 'new3@example.com', inviteCode: 'C', approved: true });
  expect(await db.listReferralsByReferrer(referrer.id)).toHaveLength(1);
});

it('referralEarnings counts pending vs credited', async () => {
  const db = await import('@/lib/db');
  const referrer = await seedApproved('ref4@example.com');
  const a = await seedApproved('a@example.com');
  await db.createReferral({ referrerId: referrer.id, referredId: a.id, referredEmail: 'a@example.com', inviteCode: 'C', approved: true });
  const e = await db.referralEarnings(referrer.id);
  expect(e).toEqual({ creditedTotal: 0, pendingCount: 1 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/referrals-db.test.ts`
Expected: FAIL (`createReferral` is not a function).

- [ ] **Step 3: Implement the helpers in `lib/db.ts`**

Add (grouped in a `// ---- Practitioner referrals ----` section):

```ts
export async function createReferral(opts: {
  referrerId: number; referredId: number; referredEmail: string; inviteCode: string; approved: boolean;
}): Promise<void> {
  const status = opts.approved ? 'signed_up' : 'invited';
  const signedUpAt = opts.approved ? new Date().toISOString() : null;
  await run(
    `INSERT OR IGNORE INTO practitioner_referrals
       (referrer_id, referred_id, referred_email, invite_code, status, signed_up_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [opts.referrerId, opts.referredId, opts.referredEmail, opts.inviteCode, status, signedUpAt]
  );
}

export async function getReferralByReferredId(referredId: number): Promise<ReferralRow | null> {
  const row = await one(`SELECT * FROM practitioner_referrals WHERE referred_id = ?`, [referredId]);
  return row ? rowToReferral(row) : null;
}

export async function markReferralSignedUp(referredId: number): Promise<void> {
  await run(
    `UPDATE practitioner_referrals
        SET status = 'signed_up', signed_up_at = datetime('now')
      WHERE referred_id = ? AND status = 'invited'`,
    [referredId]
  );
}

export async function listReferralsByReferrer(referrerId: number): Promise<ReferralView[]> {
  const rows = await all(
    `SELECT r.*, p.name AS referee_name, p.status AS referee_status
       FROM practitioner_referrals r
       JOIN practitioners p ON p.id = r.referred_id
      WHERE r.referrer_id = ?
      ORDER BY r.created_at DESC`,
    [referrerId]
  );
  return rows.map((r) => ({
    ...rowToReferral(r),
    refereeName: (r.referee_name as string) || (r.referred_email as string),
    refereeStatus: r.referee_status as string,
  }));
}

export async function referralEarnings(referrerId: number): Promise<{ creditedTotal: number; pendingCount: number }> {
  const row = await one(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'credited' THEN bonus_amount ELSE 0 END), 0) AS credited_total,
       COALESCE(SUM(CASE WHEN status != 'credited' THEN 1 ELSE 0 END), 0) AS pending_count
     FROM practitioner_referrals WHERE referrer_id = ?`,
    [referrerId]
  );
  return { creditedTotal: num(row?.credited_total), pendingCount: num(row?.pending_count) };
}
```

Add `ReferralView` to the interfaces near `ReferralRow`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/referrals-db.test.ts`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts tests/referrals-db.test.ts
git commit -m "feat(referrals): CRUD + earnings helpers"
```

---

### Task 3: Bonus engine — award £50 on first paid sale (hooked into recordOrder)

**Files:**
- Modify: `lib/db.ts` (add `referralBonusGbp`, `creditReferral`, `maybeAwardReferralBonus`; call it at the end of `recordOrder`)
- Test: `tests/referral-award.test.ts`

**Interfaces:**
- Consumes: `getReferralByReferredId`, `recordOrder` (existing), `createReferral`.
- Produces:
  - `referralBonusGbp(): number` — env `REFERRAL_BONUS_GBP`, default 50.
  - `creditReferral(referralId: number, orderId: string, bonus: number): Promise<void>` — one-shot transition to `credited`.
  - `maybeAwardReferralBonus(referredPractitionerId: number | null, orderId: string): Promise<void>` — no-op unless the referred practitioner has an un-credited referral.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/referral-award.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-referral-award-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  delete process.env.REFERRAL_BONUS_GBP;
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved(email: string) {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name: `Prac ${email}`, email, registerBody: 'BANT', registerNumber: '12345', qualificationStatus: 'qualified',
  });
  await markApproved(p.id, { affiliateCode: `WN-${p.id}-AB2C`, affiliateLink: 'http://x', pendingSync: false, decidedBy: 'system' });
  return p;
}
async function order(db: any, practitionerId: number, orderId: string) {
  await db.recordOrder({ orderId, practitionerId, code: 'X', total: 73.35, currency: 'GBP', financialStatus: 'paid', createdAt: new Date().toISOString() });
}

it('first paid sale credits the referrer £50 and completes the referral', async () => {
  const db = await import('@/lib/db');
  const referrer = await seedApproved('ref@example.com');
  const referred = await seedApproved('new@example.com');
  await db.createReferral({ referrerId: referrer.id, referredId: referred.id, referredEmail: 'new@example.com', inviteCode: 'C', approved: true });

  await order(db, referred.id, 'cart-1'); // recordOrder triggers maybeAwardReferralBonus

  const row = await db.getReferralByReferredId(referred.id);
  expect(row?.status).toBe('credited');
  expect(row?.bonusAmount).toBe(50);
  expect(row?.qualifyingOrderId).toBe('cart-1');
  expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(50);
});

it('is idempotent — a second sale does not double-credit', async () => {
  const db = await import('@/lib/db');
  const referrer = await seedApproved('ref2@example.com');
  const referred = await seedApproved('new2@example.com');
  await db.createReferral({ referrerId: referrer.id, referredId: referred.id, referredEmail: 'new2@example.com', inviteCode: 'C', approved: true });
  await order(db, referred.id, 'cart-1');
  await order(db, referred.id, 'cart-2');
  expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(50);
});

it('an unreferred practitioner sale credits nobody', async () => {
  const db = await import('@/lib/db');
  const solo = await seedApproved('solo@example.com');
  await order(db, solo.id, 'cart-1');
  expect(await db.getReferralByReferredId(solo.id)).toBeNull();
});

it('REFERRAL_BONUS_GBP overrides the default; empty falls back to 50', async () => {
  process.env.REFERRAL_BONUS_GBP = '75';
  const db = await import('@/lib/db');
  expect(db.referralBonusGbp()).toBe(75);
  process.env.REFERRAL_BONUS_GBP = '';
  expect(db.referralBonusGbp()).toBe(50);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/referral-award.test.ts`
Expected: FAIL (`referralBonusGbp` not a function; sale does not credit).

- [ ] **Step 3: Implement the engine in `lib/db.ts`**

```ts
export function referralBonusGbp(): number {
  const n = Number(process.env.REFERRAL_BONUS_GBP);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

export async function creditReferral(referralId: number, orderId: string, bonus: number): Promise<void> {
  await run(
    `UPDATE practitioner_referrals
        SET status = 'credited',
            first_sale_at = COALESCE(first_sale_at, datetime('now')),
            completed_at  = datetime('now'),
            credited_at   = datetime('now'),
            qualifying_order_id = ?,
            bonus_amount = ?
      WHERE id = ? AND status != 'credited'`,
    [orderId, bonus, referralId]
  );
}

/**
 * If this practitioner was referred and the referral hasn't paid out yet, award the
 * bonus. Called from recordOrder, so every recorded (paid) order is a qualifying sale.
 * Idempotent: the `status != 'credited'` guard makes it strictly first-sale, once.
 */
export async function maybeAwardReferralBonus(referredPractitionerId: number | null, orderId: string): Promise<void> {
  if (!referredPractitionerId) return;
  const ref = await getReferralByReferredId(referredPractitionerId);
  if (!ref || ref.status === 'credited') return;
  await creditReferral(ref.id, orderId, referralBonusGbp());
}
```

- [ ] **Step 4: Hook it into `recordOrder`**

In `lib/db.ts`, at the END of `recordOrder` (after the `INSERT ... ON CONFLICT` `run(...)`), add:

```ts
  await maybeAwardReferralBonus(o.practitionerId, o.orderId);
```

(The award is idempotent, so replayed webhooks are safe.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/referral-award.test.ts`
Expected: PASS.

- [ ] **Step 6: Full suite green**

Run: `npm test`
Expected: all prior tests + new ones PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/db.ts tests/referral-award.test.ts
git commit -m "feat(referrals): automatic idempotent £50 award via recordOrder hook"
```

---

### Task 4: Apply-time attribution + approval flip

**Files:**
- Modify: `lib/pipeline.ts` (`ApplicationInput` gains `referredByCode?`; `processApplication` creates the referral; `approvePractitioner` flips invited→signed_up)
- Modify: `app/api/apply/route.ts` (zod: optional `referredByCode`)
- Test: `tests/referral-apply.test.ts`

**Interfaces:**
- Consumes: `findByCode`, `createReferral`, `markReferralSignedUp`, `getReferralByReferredId` (from `lib/db.ts`).
- Produces: attribution side-effects (referral rows) during `processApplication` / `approvePractitioner`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/referral-apply.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-referral-apply-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApprovedReferrer() {
  const { insertApplication, markApproved, getPractitioner } = await import('@/lib/db');
  const p = await insertApplication({ name: 'Referrer', email: 'ref@example.com', registerBody: 'BANT', registerNumber: '111', qualificationStatus: 'qualified' });
  await markApproved(p.id, { affiliateCode: 'WN-REF-CODE', affiliateLink: 'http://x', pendingSync: false, decidedBy: 'system' });
  return (await getPractitioner(p.id))!;
}

it('a qualified applicant with a valid ref code becomes a signed_up referral', async () => {
  const referrer = await seedApprovedReferrer();
  const { processApplication } = await import('@/lib/pipeline');
  const db = await import('@/lib/db');
  const applicant = await processApplication({
    name: 'New Joiner', email: 'join@example.com', registerBody: 'BANT', registerNumber: '222',
    qualificationStatus: 'qualified', referredByCode: 'WN-REF-CODE',
  });
  const ref = await db.getReferralByReferredId(applicant.id);
  expect(ref?.referrerId).toBe(referrer.id);
  // qualified BANT auto-approves in this repo → signed_up; if flagged in your data, it would be 'invited'
  expect(['signed_up', 'invited']).toContain(ref?.status);
});

it('an invalid ref code is ignored and the application still succeeds', async () => {
  const { processApplication } = await import('@/lib/pipeline');
  const db = await import('@/lib/db');
  const applicant = await processApplication({
    name: 'No Ref', email: 'noref@example.com', registerBody: 'BANT', registerNumber: '333',
    qualificationStatus: 'qualified', referredByCode: 'WN-DOES-NOT-EXIST',
  });
  expect(applicant.id).toBeTruthy();
  expect(await db.getReferralByReferredId(applicant.id)).toBeNull();
});

it('self-referral (same email as referrer) creates no referral', async () => {
  await seedApprovedReferrer();
  const { processApplication } = await import('@/lib/pipeline');
  const db = await import('@/lib/db');
  // DuplicateEmailError path: same email is already blocked; assert it throws (no referral leak)
  await expect(processApplication({
    name: 'Ref', email: 'ref@example.com', registerBody: 'BANT', registerNumber: '444',
    qualificationStatus: 'qualified', referredByCode: 'WN-REF-CODE',
  })).rejects.toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/referral-apply.test.ts`
Expected: FAIL (`referredByCode` not accepted / no referral created).

- [ ] **Step 3: Extend `ApplicationInput` + attribution in `processApplication`**

In `lib/pipeline.ts`, add to the interface:

```ts
export interface ApplicationInput {
  name: string;
  email: string;
  registerBody: string;
  registerNumber: string;
  qualificationStatus: QualificationStatus;
  referredByCode?: string;
}
```

Add imports at the top of `lib/pipeline.ts`:

```ts
import { findByCode, createReferral } from '@/lib/db';
```

In `processApplication`, immediately AFTER `const decision = decide({ ... });` (so both approved and flagged paths run it), insert:

```ts
  // Practitioner-to-practitioner referral attribution (best-effort; never blocks signup).
  const refCode = input.referredByCode?.trim();
  if (refCode) {
    const referrer = await findByCode(refCode);
    if (referrer && referrer.status === 'approved' && referrer.id !== record.id && referrer.email !== input.email) {
      await createReferral({
        referrerId: referrer.id,
        referredId: record.id,
        referredEmail: input.email,
        inviteCode: referrer.affiliateCode ?? refCode,
        approved: decision.status === 'approved',
      });
    }
  }
```

- [ ] **Step 4: Flip invited→signed_up on later approval**

In `lib/pipeline.ts` `approvePractitioner`, add the import `markReferralSignedUp` to the existing `@/lib/db` import, and after the `finalizeApproval(...)` call resolves, before returning:

```ts
export async function approvePractitioner(id: number, decidedBy: string): Promise<Practitioner> {
  const existing = await getPractitioner(id);
  if (!existing) throw new Error(`No practitioner with id ${id}`);
  if (existing.status === 'approved' && existing.affiliateCode) return existing; // idempotent
  const approved = await finalizeApproval(id, existing.verification, decidedBy);
  await markReferralSignedUp(id); // no-op unless they were an 'invited' referral
  return approved;
}
```

- [ ] **Step 5: Accept `referredByCode` in the apply API**

In `app/api/apply/route.ts`, extend the zod schema:

```ts
const applySchema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name').max(100),
  email: z.string().trim().email('Please enter a valid email address'),
  registerBody: z.enum(['BANT', 'CNHC', 'NNA', 'ANP']),
  registerNumber: z.string().trim().min(2, 'Please enter your membership number').max(30),
  qualificationStatus: z.enum(['qualified', 'student']),
  referredByCode: z.string().trim().max(30).optional(),
});
```

(`processApplication(parsed.data)` already forwards the new optional field.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/referral-apply.test.ts`
Expected: PASS.

- [ ] **Step 7: Full suite green + commit**

```bash
npm test
git add lib/pipeline.ts app/api/apply/route.ts tests/referral-apply.test.ts
git commit -m "feat(referrals): apply-time attribution + approval sign-up flip"
```

---

### Task 5: Practitioner API — `GET /api/me/referrals`

**Files:**
- Create: `app/api/me/referrals/route.ts`
- Test: `tests/api-referrals.test.ts`

**Interfaces:**
- Consumes: `getSessionPractitioner`, `listReferralsByReferrer`, `referralEarnings`, `portalUrl` (from `lib/codes.ts`).
- Produces: `GET` → `{ inviteLink: string; earnings: { creditedTotal: number; pendingCount: number }; referrals: ReferralView[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/api-referrals.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-api-referrals-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.SESSION_SECRET = 'test-secret';
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

it('401s without a session', async () => {
  const { GET } = await import('@/app/api/me/referrals/route');
  const res = await GET(new Request('http://localhost/api/me/referrals'));
  expect(res.status).toBe(401);
});

it('returns invite link + earnings + referrals for the signed-in practitioner', async () => {
  const db = await import('@/lib/db');
  const { insertApplication, markApproved } = db;
  const p = await insertApplication({ name: 'Me', email: 'me@example.com', registerBody: 'BANT', registerNumber: '1', qualificationStatus: 'qualified' });
  await markApproved(p.id, { affiliateCode: 'WN-ME-CODE', affiliateLink: 'http://x', pendingSync: false, decidedBy: 'system' });
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  const cookie = sessionCookieHeader(p.id).split(';')[0];

  const { GET } = await import('@/app/api/me/referrals/route');
  const res = await GET(new Request('http://localhost/api/me/referrals', { headers: { cookie } }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.inviteLink).toContain('ref=WN-ME-CODE');
  expect(body.earnings).toEqual({ creditedTotal: 0, pendingCount: 0 });
  expect(Array.isArray(body.referrals)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api-referrals.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the route**

```ts
// app/api/me/referrals/route.ts
import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { listReferralsByReferrer, referralEarnings } from '@/lib/db';
import { portalUrl } from '@/lib/codes';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const [referrals, earnings] = await Promise.all([
    listReferralsByReferrer(p.id),
    referralEarnings(p.id),
  ]);
  const inviteLink = `${portalUrl()}/apply?ref=${encodeURIComponent(p.affiliateCode ?? '')}`;
  return NextResponse.json({ inviteLink, earnings, referrals });
}
```

Verify the export name in `lib/codes.ts` is `portalUrl` (grep: `export function portalUrl`). If it is named differently (e.g. `portalBaseUrl`), use that name.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api-referrals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/me/referrals/route.ts tests/api-referrals.test.ts
git commit -m "feat(referrals): GET /api/me/referrals"
```

---

### Task 6: Apply form — read `?ref=` and show an optional "Referred by" field

**Files:**
- Modify: `components/ApplyForm.tsx`
- Test: manual/browser (this is presentational; the payload path is covered by Task 4).

**Interfaces:**
- Consumes: existing `/api/apply` (accepts `referredByCode` after Task 4).

- [ ] **Step 1: Read the `ref` query param**

At the top of the `ApplyForm` component body, add (component is already `'use client'`):

```tsx
import { useSearchParams } from 'next/navigation';
// ...inside the component, with the other hooks:
const refCode = useSearchParams().get('ref') ?? '';
```

- [ ] **Step 2: Add the field to the form**

Inside the `<form>`, after the qualification-status block (before the submit button), add:

```tsx
<div className="mt-6">
  <label htmlFor="referredByCode" className={labelClass}>Referred by (optional)</label>
  <input
    id="referredByCode"
    name="referredByCode"
    defaultValue={refCode}
    maxLength={30}
    className={inputClass}
    placeholder="Colleague's referral code"
  />
  <p className="mt-1 text-xs text-ink2/60">If a Wild Nutrition practitioner invited you, their code is pre-filled here.</p>
</div>
```

Because the form submits via `FormData → Object.fromEntries`, `referredByCode` flows into the payload automatically — no change to `onSubmit` needed.

- [ ] **Step 3: Verify in the browser**

Run the dev server (`portal-dev`, port 3100). Visit `http://localhost:3100/apply?ref=WN-TEST-CODE`; confirm the field is pre-filled with `WN-TEST-CODE`, and `http://localhost:3100/apply` shows it blank. Confirm no console errors and no horizontal overflow at 375px.

- [ ] **Step 4: Commit**

```bash
git add components/ApplyForm.tsx
git commit -m "feat(referrals): apply form reads ?ref= into optional referred-by field"
```

---

### Task 7: `/referrals` page + nav link + dashboard card

**Files:**
- Create: `app/referrals/page.tsx`, `components/ReferralsApp.tsx`
- Modify: `components/SiteHeader.tsx` (nav item), `components/DashboardApp.tsx` (summary card)
- Test: browser verification (data paths covered by Tasks 2/3/5).

**Interfaces:**
- Consumes: `GET /api/me/referrals` (Task 5).

- [ ] **Step 1: Create the server shell**

```tsx
// app/referrals/page.tsx
import { redirect } from 'next/navigation';
import { getServerSessionPractitioner } from '@/lib/serverSession';
import ReferralsApp from '@/components/ReferralsApp';

export const dynamic = 'force-dynamic';

export default async function ReferralsPage() {
  const p = await getServerSessionPractitioner();
  if (!p || p.status !== 'approved') redirect('/dashboard');
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-heading text-4xl text-ink">Refer a Colleague</h1>
      <p className="mt-2 text-ink2">Grow the community — earn £50 when a colleague you invite makes their first sale.</p>
      <ReferralsApp />
    </main>
  );
}
```

- [ ] **Step 2: Create the client component**

```tsx
// components/ReferralsApp.tsx
'use client';

import { useEffect, useState } from 'react';

interface ReferralView {
  id: number; refereeName: string; refereeStatus: string;
  status: 'invited' | 'signed_up' | 'first_sale' | 'completed' | 'credited';
  bonusAmount: number;
}
interface Data {
  inviteLink: string;
  earnings: { creditedTotal: number; pendingCount: number };
  referrals: ReferralView[];
}

const STAGES: { key: string; label: string }[] = [
  { key: 'signed_up', label: 'Signed up' },
  { key: 'first_sale', label: 'First purchase' },
  { key: 'completed', label: 'Referral completed' },
  { key: 'credited', label: 'Added to earnings' },
];
const ORDER = ['invited', 'signed_up', 'first_sale', 'completed', 'credited'];

function reached(status: string, stageKey: string): boolean {
  return ORDER.indexOf(status) >= ORDER.indexOf(stageKey);
}

export default function ReferralsApp() {
  const [data, setData] = useState<Data | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { fetch('/api/me/referrals').then((r) => r.json()).then(setData).catch(() => {}); }, []);

  if (!data) return <p className="mt-8 text-ink2/60">Loading…</p>;

  return (
    <div className="mt-8 space-y-8">
      <div className="border border-stone bg-white p-5">
        <p className="text-xs uppercase tracking-[0.15em] text-forest">Your invite link</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded bg-cream px-3 py-2 text-sm">{data.inviteLink}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(data.inviteLink); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="shrink-0 bg-forest px-4 py-2 text-xs uppercase tracking-[0.15em] text-cream"
          >{copied ? 'Copied' : 'Copy link'}</button>
        </div>
        <p className="mt-4 text-sm">
          <span className="font-medium text-forest">£{data.earnings.creditedTotal.toFixed(2)} credited</span>
          <span className="text-ink2/60"> · {data.earnings.pendingCount} pending</span>
        </p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.15em] text-ink2/70">Your referrals</p>
        {data.referrals.length === 0 ? (
          <p className="mt-3 text-sm text-ink2/60">No referrals yet. Share your link with a colleague to get started.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.referrals.map((r) => (
              <li key={r.id} className="border border-stone bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-ink">{r.refereeName}</span>
                  <span className={`shrink-0 text-sm ${r.status === 'credited' ? 'text-forest' : 'text-ink2/60'}`}>
                    {r.status === 'credited' ? `£${r.bonusAmount.toFixed(0)} ✓` : 'pending'}
                  </span>
                </div>
                <ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
                  {STAGES.map((s, i) => (
                    <li key={s.key} className="flex items-center gap-2 sm:flex-1">
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${reached(r.status, s.key) ? 'bg-forest text-cream' : 'border border-stone text-ink2/40'}`}>
                        {reached(r.status, s.key) ? '✓' : i + 1}
                      </span>
                      <span className={`text-xs ${reached(r.status, s.key) ? 'text-ink' : 'text-ink2/50'}`}>{s.label}</span>
                      {i < STAGES.length - 1 && <span className="mx-2 hidden h-px flex-1 bg-stone sm:block" />}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the nav link**

In `components/SiteHeader.tsx`, add to `PRACTITIONER_NAV` (after `Patient Carts`):

```ts
  { label: 'Refer & Earn', href: '/referrals' },
```

- [ ] **Step 4: Add the dashboard card**

In `components/DashboardApp.tsx`, add a quick-link card pointing to `/referrals` in the existing quick-links grid (match the sibling cards' markup exactly). Example card:

```tsx
<a href="/referrals" className="border border-stone bg-white p-6 transition-colors hover:border-terracotta">
  <p className="font-heading text-2xl text-ink">Refer &amp; Earn</p>
  <p className="mt-1 text-sm text-ink2/70">Invite a colleague — earn £50 on their first sale.</p>
</a>
```

(Place it alongside the other quick-link `<a>` cards; copy the exact className of a neighbouring card if it differs.)

- [ ] **Step 5: Verify in the browser (mobile + desktop)**

Dev server on 3100. Log in (magic-link dev flow), visit `/referrals`: confirm invite link + copy button work, the stage tracker renders, and it's clean at 375px (no overflow) and on desktop. Confirm the nav shows "Refer & Earn" (in the hamburger on mobile) and the dashboard card links correctly. Check `read_console_messages` for errors.

- [ ] **Step 6: Commit**

```bash
git add app/referrals/page.tsx components/ReferralsApp.tsx components/SiteHeader.tsx components/DashboardApp.tsx
git commit -m "feat(referrals): /referrals page, nav link, dashboard card"
```

---

### Task 8: Admin read-only referrals view

**Files:**
- Create: `app/api/admin/referrals/route.ts`, `components/AdminReferrals.tsx`
- Modify: `lib/db.ts` (`listAllReferrals`), `components/AdminDashboard.tsx` (section card + render)
- Test: `tests/api-admin-referrals.test.ts`

**Interfaces:**
- Consumes: `isAuthed` (from `lib/adminAuth`), `listReferralsByReferrer` pattern.
- Produces:
  - `listAllReferrals(): Promise<Array<ReferralView & { referrerName: string }>>`
  - `GET /api/admin/referrals` → `{ referrals: [...], totalCredited: number }`

- [ ] **Step 1: Write the failing API test**

```ts
// tests/api-admin-referrals.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-admin-referrals-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'test-admin';
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

it('401s without the admin cookie', async () => {
  const { GET } = await import('@/app/api/admin/referrals/route');
  const res = await GET(new Request('http://localhost/api/admin/referrals'));
  expect(res.status).toBe(401);
});

it('returns referrals + total for an authed admin', async () => {
  const hash = crypto.createHash('sha256').update('test-admin').digest('hex');
  const { GET } = await import('@/app/api/admin/referrals/route');
  const res = await GET(new Request('http://localhost/api/admin/referrals', { headers: { cookie: `wn_admin=${hash}` } }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('referrals');
  expect(body).toHaveProperty('totalCredited');
});
```

Confirm the admin cookie name/format by reading `lib/adminAuth.ts` (`wn_admin` = SHA-256 of `ADMIN_PASSWORD`). Adjust the test cookie if the format differs.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api-admin-referrals.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `listAllReferrals` in `lib/db.ts`**

```ts
export async function listAllReferrals(): Promise<Array<ReferralView & { referrerName: string }>> {
  const rows = await all(
    `SELECT r.*, ref.name AS referee_name, ref.status AS referee_status, rr.name AS referrer_name
       FROM practitioner_referrals r
       JOIN practitioners ref ON ref.id = r.referred_id
       JOIN practitioners rr  ON rr.id  = r.referrer_id
      ORDER BY r.created_at DESC`
  );
  return rows.map((r) => ({
    ...rowToReferral(r),
    refereeName: (r.referee_name as string) || (r.referred_email as string),
    refereeStatus: r.referee_status as string,
    referrerName: r.referrer_name as string,
  }));
}
```

- [ ] **Step 4: Implement the admin route**

```ts
// app/api/admin/referrals/route.ts
import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { listAllReferrals } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const referrals = await listAllReferrals();
  const totalCredited = referrals.reduce((s, r) => s + (r.status === 'credited' ? r.bonusAmount : 0), 0);
  return NextResponse.json({ referrals, totalCredited });
}
```

Verify `isAuthed`'s signature in `lib/adminAuth.ts` (it takes the `Request`). Match the existing admin routes' usage exactly.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/api-admin-referrals.test.ts`
Expected: PASS.

- [ ] **Step 6: Build the admin component**

```tsx
// components/AdminReferrals.tsx
'use client';

import { useEffect, useState } from 'react';

interface Row {
  id: number; referrerName: string; refereeName: string; refereeStatus: string;
  status: string; bonusAmount: number; createdAt: string; creditedAt: string | null;
}

export default function AdminReferrals() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch('/api/admin/referrals').then((r) => r.json()).then((d) => { setRows(d.referrals); setTotal(d.totalCredited); }).catch(() => setRows([]));
  }, []);

  if (!rows) return <p className="mt-6 text-sm text-ink2/60">Loading…</p>;

  return (
    <div className="mt-6">
      <p className="text-sm text-ink2/70">{rows.length} referrals · <span className="text-forest">£{total.toFixed(2)} credited</span></p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse bg-white text-sm">
          <thead>
            <tr className="border-b border-stone text-left text-xs uppercase tracking-[0.1em] text-ink2/70">
              <th className="p-3">Referrer</th><th className="p-3">Referred</th><th className="p-3">Status</th><th className="p-3">Bonus</th><th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-stone/60">
                <td className="p-3 text-ink">{r.referrerName}</td>
                <td className="p-3 text-ink">{r.refereeName} <span className="text-ink2/50">({r.refereeStatus})</span></td>
                <td className="p-3"><span className={r.status === 'credited' ? 'text-forest' : 'text-terracotta'}>{r.status}</span></td>
                <td className="p-3">{r.status === 'credited' ? `£${r.bonusAmount.toFixed(2)}` : '—'}</td>
                <td className="p-3 text-ink2/60">{r.createdAt?.slice(0, 10)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-sm text-ink2/60">No referrals yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Register the admin section card**

In `components/AdminDashboard.tsx`: import `AdminReferrals`, add a `'referrals'` entry to the GROUPS config under the **"Insights and ops"** group (mirror an existing card's shape — `key`, `label` "Referrals", `desc` "P2P bonuses", an appropriate `lucide-react` icon such as `Users`), and add a render branch `{section === 'referrals' && <AdminReferrals />}` alongside the other section renders. Follow the exact pattern the file already uses for a section like `AdminReporting`/`AdminAiQueries`.

- [ ] **Step 8: Full suite green + browser verify**

Run: `npm test` (expect all green). Then, on the dev server, log into `/admin`, open the **Referrals** card, and confirm the table renders and scrolls cleanly at 375px (no page overflow), matching the other admin tables.

- [ ] **Step 9: Commit**

```bash
git add lib/db.ts app/api/admin/referrals/route.ts components/AdminReferrals.tsx components/AdminDashboard.tsx tests/api-admin-referrals.test.ts
git commit -m "feat(referrals): admin read-only referrals view"
```

---

## Final verification (after all tasks)

- [ ] `npm test` — all green (existing 319 + new referral tests).
- [ ] `npm run build` — clean (stop the dev server first; it corrupts `.next` page-data collection).
- [ ] Browser E2E on mobile (375px) + desktop: apply-with-`?ref=` → approve → pay a Patient Cart for the referred practitioner → referrer's `/referrals` shows the referral advance to "Added to earnings" with £50; dashboard card + admin view reflect it. No console errors, no horizontal overflow.
- [ ] Update `PRACTSESSION_HANDOFF.md` with a NEWEST SESSION block for the referral network (migration 017, files, env `REFERRAL_BONUS_GBP`).

## Self-review notes (planner)

- **Spec coverage:** invite link (T6/T7), attribution (T4), 4-stage model (T2 status + T7 tracker), automatic £50 on first paid sale (T3), tracked-in-app earnings (T2/T5/T7), dashboard card (T7), read-only admin view (T8), config env (T3), edge cases — self-referral (T4), flagged→approved flip (T4), idempotency/one-time (T3), invalid ref ignored (T4). All covered.
- **Deviations from spec** (documented above): dropped redundant `practitioners.referred_by_practitioner_id`; all helpers in `lib/db.ts` (no `lib/referrals.ts`) to keep the `recordOrder` hook import-cycle-free.
- **Verify-before-use flags for the implementer:** confirm `portalUrl` export name in `lib/codes.ts`; confirm `markApproved` arg shape (used in tests) and `isAuthed(req)` usage against existing admin routes; match `DashboardApp` quick-link card markup and `AdminDashboard` GROUPS/section pattern exactly rather than inventing new structure.
