import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
const V2_ENV = ['REFERRAL_BONUS_GBP', 'REFERRAL_REQUIRE_APPROVAL', 'REFERRAL_MAX_PER_REFERRER'];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-referral-v2-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  for (const k of V2_ENV) delete process.env[k];
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  for (const k of V2_ENV) delete process.env[k];
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

/** referrer + referred with an active signed_up referral between them. */
async function seedPair(tag: string) {
  const db = await import('@/lib/db');
  const referrer = await seedApproved(`ref-${tag}@example.com`);
  const referred = await seedApproved(`new-${tag}@example.com`);
  await db.createReferral({
    referrerId: referrer.id, referredId: referred.id,
    referredEmail: `new-${tag}@example.com`, inviteCode: 'C', approved: true,
  });
  return { db, referrer, referred };
}

async function order(
  db: any, practitionerId: number, orderId: string, financialStatus: string | null = 'paid', total = 73.35
) {
  await db.recordOrder({
    orderId, practitionerId, code: 'X', total, currency: 'GBP', financialStatus,
    createdAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// 1. Gate credit on financialStatus
// v1 credited on ANY recorded order. Real Shopify fires orders/create for
// pending/unpaid orders too, so v1 would have paid out £50 for an order that
// was never actually paid.
// ---------------------------------------------------------------------------
describe('credit is gated on financialStatus', () => {
  it('does not credit an unpaid (pending) order', async () => {
    const { db, referrer, referred } = await seedPair('pending');
    await order(db, referred.id, 'ord-1', 'pending');
    const row = await db.getReferralByReferredId(referred.id);
    expect(row?.status).toBe('signed_up');
    expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(0);
  });

  it('does not credit when financialStatus is absent', async () => {
    const { db, referred } = await seedPair('null');
    await order(db, referred.id, 'ord-1', null);
    expect((await db.getReferralByReferredId(referred.id))?.status).toBe('signed_up');
  });

  it('credits once the same order is later reported paid', async () => {
    const { db, referrer, referred } = await seedPair('later');
    await order(db, referred.id, 'ord-1', 'pending');
    expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(0);
    await order(db, referred.id, 'ord-1', 'paid'); // orders/paid webhook for the same order
    const row = await db.getReferralByReferredId(referred.id);
    expect(row?.status).toBe('credited');
    expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// 2. Clawback on refund
// ---------------------------------------------------------------------------
describe('clawback', () => {
  it('reverses the credit when the qualifying order is refunded', async () => {
    const { db, referrer, referred } = await seedPair('refund');
    await order(db, referred.id, 'ord-1', 'paid');
    expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(50);

    await order(db, referred.id, 'ord-1', 'refunded');

    const row = await db.getReferralByReferredId(referred.id);
    expect(row?.status).toBe('clawed_back');
    expect(row?.bonusAmount).toBe(0);
    expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(0);
  });

  it('also claws back a voided order', async () => {
    const { db, referred } = await seedPair('void');
    await order(db, referred.id, 'ord-1', 'paid');
    await order(db, referred.id, 'ord-1', 'voided');
    expect((await db.getReferralByReferredId(referred.id))?.status).toBe('clawed_back');
  });

  it('leaves other referrals untouched when one is refunded', async () => {
    const a = await seedPair('keep-a');
    const b = await seedPair('keep-b');
    await order(a.db, a.referred.id, 'ord-a', 'paid');
    await order(b.db, b.referred.id, 'ord-b', 'paid');
    await order(a.db, a.referred.id, 'ord-a', 'refunded');
    expect((await a.db.referralEarnings(a.referrer.id)).creditedTotal).toBe(0);
    expect((await b.db.referralEarnings(b.referrer.id)).creditedTotal).toBe(50);
  });

  it('does not re-credit a clawed-back referral on a later sale (anti-abuse)', async () => {
    const { db, referrer, referred } = await seedPair('nore');
    await order(db, referred.id, 'ord-1', 'paid');
    await order(db, referred.id, 'ord-1', 'refunded');
    await order(db, referred.id, 'ord-2', 'paid');
    expect((await db.getReferralByReferredId(referred.id))?.status).toBe('clawed_back');
    expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(0);
  });

  it('a refund for an unrelated order does not touch any referral', async () => {
    const { db, referrer, referred } = await seedPair('unrelated');
    await order(db, referred.id, 'ord-1', 'paid');
    await order(db, referred.id, 'ord-other', 'refunded');
    expect((await db.getReferralByReferredId(referred.id))?.status).toBe('credited');
    expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// 3. Per-referrer cap (default unlimited = v1 behaviour)
// ---------------------------------------------------------------------------
describe('per-referrer cap', () => {
  it('is unlimited by default', async () => {
    const { referralMaxPerReferrer } = await import('@/lib/db');
    expect(referralMaxPerReferrer()).toBe(Infinity);
  });

  it('reads REFERRAL_MAX_PER_REFERRER, ignoring junk values', async () => {
    const db = await import('@/lib/db');
    process.env.REFERRAL_MAX_PER_REFERRER = '2';
    expect(db.referralMaxPerReferrer()).toBe(2);
    process.env.REFERRAL_MAX_PER_REFERRER = '';
    expect(db.referralMaxPerReferrer()).toBe(Infinity);
    process.env.REFERRAL_MAX_PER_REFERRER = 'abc';
    expect(db.referralMaxPerReferrer()).toBe(Infinity);
  });

  it('completes but does not credit a referral beyond the cap', async () => {
    process.env.REFERRAL_MAX_PER_REFERRER = '1';
    const db = await import('@/lib/db');
    const referrer = await seedApproved('capped@example.com');
    const first = await seedApproved('first@example.com');
    const second = await seedApproved('second@example.com');
    for (const [p, email] of [[first, 'first@example.com'], [second, 'second@example.com']] as const) {
      await db.createReferral({ referrerId: referrer.id, referredId: p.id, referredEmail: email, inviteCode: 'C', approved: true });
    }

    await order(db, first.id, 'ord-1', 'paid');
    await order(db, second.id, 'ord-2', 'paid');

    expect((await db.getReferralByReferredId(first.id))?.status).toBe('credited');
    const capped = await db.getReferralByReferredId(second.id);
    expect(capped?.status).toBe('completed'); // qualified, but not paid out
    expect(capped?.bonusAmount).toBe(0);
    expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// 4. Admin approval gate (opt-in; default off preserves v1's locked decision)
// ---------------------------------------------------------------------------
describe('admin approval gate', () => {
  it('is off by default', async () => {
    const { referralRequiresApproval } = await import('@/lib/db');
    expect(referralRequiresApproval()).toBe(false);
  });

  it('holds a qualifying referral at awaiting_approval instead of crediting', async () => {
    process.env.REFERRAL_REQUIRE_APPROVAL = 'true';
    const { db, referrer, referred } = await seedPair('approve');
    await order(db, referred.id, 'ord-1', 'paid');

    const row = await db.getReferralByReferredId(referred.id);
    expect(row?.status).toBe('awaiting_approval');
    expect(row?.qualifyingOrderId).toBe('ord-1');
    expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(0);
  });

  it('credits on admin approval, recording who approved it', async () => {
    process.env.REFERRAL_REQUIRE_APPROVAL = 'true';
    const { db, referrer, referred } = await seedPair('approve2');
    await order(db, referred.id, 'ord-1', 'paid');
    const pending = await db.getReferralByReferredId(referred.id);

    await db.approveReferralCredit(pending!.id, 'admin');

    const row = await db.getReferralByReferredId(referred.id);
    expect(row?.status).toBe('credited');
    expect(row?.bonusAmount).toBe(50);
    expect(row?.approvedBy).toBe('admin');
    expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(50);
  });

  it('approving twice does not double-credit', async () => {
    process.env.REFERRAL_REQUIRE_APPROVAL = 'true';
    const { db, referrer, referred } = await seedPair('approve3');
    await order(db, referred.id, 'ord-1', 'paid');
    const pending = await db.getReferralByReferredId(referred.id);
    await db.approveReferralCredit(pending!.id, 'admin');
    await db.approveReferralCredit(pending!.id, 'someone-else');
    expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(50);
    expect((await db.getReferralByReferredId(referred.id))?.approvedBy).toBe('admin');
  });

  it('respects the cap at approval time too', async () => {
    process.env.REFERRAL_REQUIRE_APPROVAL = 'true';
    process.env.REFERRAL_MAX_PER_REFERRER = '0';
    const { db, referrer, referred } = await seedPair('approve4');
    await order(db, referred.id, 'ord-1', 'paid');
    const pending = await db.getReferralByReferredId(referred.id);
    await db.approveReferralCredit(pending!.id, 'admin');
    expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(0);
  });
});
