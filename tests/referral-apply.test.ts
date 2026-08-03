import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

it('a qualified applicant with a valid ref code becomes a referral', async () => {
  const referrer = await seedApprovedReferrer();
  const { processApplication } = await import('@/lib/pipeline');
  const db = await import('@/lib/db');
  const applicant = await processApplication({
    name: 'New Joiner', email: 'join@example.com', registerBody: 'BANT', registerNumber: '222',
    qualificationStatus: 'qualified', referredByCode: 'WN-REF-CODE',
  });
  const ref = await db.getReferralByReferredId(applicant.id);
  expect(ref?.referrerId).toBe(referrer.id);
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
  // Same email is blocked by DuplicateEmailError; assert it throws (no referral leak).
  await expect(processApplication({
    name: 'Ref', email: 'ref@example.com', registerBody: 'BANT', registerNumber: '444',
    qualificationStatus: 'qualified', referredByCode: 'WN-REF-CODE',
  })).rejects.toBeTruthy();
});

it('approving a flagged referred practitioner flips invited → signed_up', async () => {
  const referrer = await seedApprovedReferrer();
  const db = await import('@/lib/db');
  // Simulate an invited referral (applicant not yet approved).
  const applicant = await db.insertApplication({ name: 'Student X', email: 'stud@example.com', registerBody: 'BANT', registerNumber: '555', qualificationStatus: 'student' });
  await db.createReferral({ referrerId: referrer.id, referredId: applicant.id, referredEmail: 'stud@example.com', inviteCode: 'WN-REF-CODE', approved: false });
  expect((await db.getReferralByReferredId(applicant.id))?.status).toBe('invited');

  const { approvePractitioner } = await import('@/lib/pipeline');
  await approvePractitioner(applicant.id, 'admin');
  expect((await db.getReferralByReferredId(applicant.id))?.status).toBe('signed_up');
});
