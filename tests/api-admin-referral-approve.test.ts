import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-admin-ref-approve-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'test-admin';
  process.env.REFERRAL_REQUIRE_APPROVAL = 'true';
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  delete process.env.REFERRAL_REQUIRE_APPROVAL;
  fs.rmSync(dir, { recursive: true, force: true });
});

const adminCookie = () => ({
  cookie: `wn_admin=${crypto.createHash('sha256').update('test-admin').digest('hex')}`,
});

async function seedAwaitingApproval() {
  const db = await import('@/lib/db');
  const mk = async (email: string) => {
    const p = await db.insertApplication({
      name: `Prac ${email}`, email, registerBody: 'BANT', registerNumber: '1', qualificationStatus: 'qualified',
    });
    await db.markApproved(p.id, { affiliateCode: `WN-${p.id}-AB2C`, affiliateLink: 'http://x', pendingSync: false, decidedBy: 'system' });
    return p;
  };
  const referrer = await mk('ref@example.com');
  const referred = await mk('new@example.com');
  await db.createReferral({ referrerId: referrer.id, referredId: referred.id, referredEmail: 'new@example.com', inviteCode: 'C', approved: true });
  await db.recordOrder({
    orderId: 'ord-1', practitionerId: referred.id, code: 'X', total: 80,
    currency: 'GBP', financialStatus: 'paid', createdAt: new Date().toISOString(),
  });
  const ref = await db.getReferralByReferredId(referred.id);
  return { db, referrer, referred, referralId: ref!.id };
}

const req = (id: number, headers: Record<string, string> = {}) =>
  new Request(`http://localhost/api/admin/referrals/${id}/approve`, { method: 'POST', headers });
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

it('401s without the admin cookie and does not credit', async () => {
  const { referralId, db, referrer } = await seedAwaitingApproval();
  const { POST } = await import('@/app/api/admin/referrals/[id]/approve/route');
  expect((await POST(req(referralId), params(referralId))).status).toBe(401);
  expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(0);
});

it('credits the referral for an authed admin', async () => {
  const { referralId, db, referrer, referred } = await seedAwaitingApproval();
  const { POST } = await import('@/app/api/admin/referrals/[id]/approve/route');
  const res = await POST(req(referralId, adminCookie()), params(referralId));
  expect(res.status).toBe(200);
  const row = await db.getReferralByReferredId(referred.id);
  expect(row?.status).toBe('credited');
  expect(row?.approvedBy).toBe('admin');
  expect((await db.referralEarnings(referrer.id)).creditedTotal).toBe(50);
});

it('404s on an unknown referral id', async () => {
  await seedAwaitingApproval();
  const { POST } = await import('@/app/api/admin/referrals/[id]/approve/route');
  expect((await POST(req(9999, adminCookie()), params(9999))).status).toBe(404);
});

it('400s on a non-numeric id', async () => {
  await seedAwaitingApproval();
  const { POST } = await import('@/app/api/admin/referrals/[id]/approve/route');
  const res = await POST(
    new Request('http://localhost/api/admin/referrals/abc/approve', { method: 'POST', headers: adminCookie() }),
    { params: Promise.resolve({ id: 'abc' }) }
  );
  expect(res.status).toBe(400);
});

it('GET /api/admin/referrals exposes the awaiting-approval queue', async () => {
  await seedAwaitingApproval();
  const { GET } = await import('@/app/api/admin/referrals/route');
  const body = await (await GET(new Request('http://localhost/api/admin/referrals', { headers: adminCookie() }))).json();
  expect(body.awaitingApproval).toHaveLength(1);
  expect(body.awaitingApproval[0].referrerName).toContain('ref@example.com');
  expect(body.requiresApproval).toBe(true);
});
