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
  const { rows } = await execForTests(`PRAGMA table_info(practitioner_referrals)`);
  const cols = (rows as any[]).map((r) => r.name);
  expect(cols).toEqual(
    expect.arrayContaining([
      'id', 'referrer_id', 'referred_id', 'referred_email', 'invite_code', 'status',
      'qualifying_order_id', 'bonus_amount', 'currency', 'signed_up_at', 'first_sale_at',
      'completed_at', 'credited_at', 'created_at',
    ])
  );
});

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
