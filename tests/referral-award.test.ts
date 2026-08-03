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
