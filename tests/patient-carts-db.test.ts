import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-carts-db-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved(email = 'p@example.com') {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name: 'Prac One', email, registerBody: 'BANT', registerNumber: '12345', qualificationStatus: 'qualified',
  });
  await markApproved(p.id, { affiliateCode: `WN-${p.id}-AB2C`, affiliateLink: 'http://x', pendingSync: false, decidedBy: 'system' });
  return p;
}

async function makeCart(practitionerId: number, token = 'tok_abc') {
  const db = await import('@/lib/db');
  return db.createPatientCart({
    practitionerId, patientName: 'Patient Pat', patientEmail: 'pat@example.com', token,
    provider: 'mock', externalId: 'mock-cart', payUrl: `/pay/${token}`,
    subtotal: 74.7, discountAmount: 7.47, total: 67.23, commissionAmount: 13.45, currency: 'GBP',
    items: [{ productRef: 'daily-multi', title: 'Daily Multi', imageUrl: 'http://x/i.jpg', unitPrice: 29.6, qty: 2 },
            { productRef: 'vitamin-d', title: 'Vitamin D', imageUrl: 'http://x/d.jpg', unitPrice: 15.5, qty: 1 }],
  });
}

describe('patient carts db', () => {
  it('creates a cart with items and reads it back by token', async () => {
    const p = await seedApproved();
    const db = await import('@/lib/db');
    const created = await makeCart(p.id);
    expect(created.id).toBeGreaterThan(0);
    expect(created.status).toBe('draft');
    const byToken = await db.getCartByToken('tok_abc');
    expect(byToken!.total).toBe(67.23);
    expect(byToken!.items!.length).toBe(2);
    expect(byToken!.items![0].qty).toBe(2);
  });

  it('lists a practitioner\'s carts, newest first, and isolates by practitioner', async () => {
    const a = await seedApproved('a@example.com');
    const b = await seedApproved('b@example.com');
    const db = await import('@/lib/db');
    await makeCart(a.id, 't1');
    await makeCart(b.id, 't2');
    const listA = await db.listPatientCartsForPractitioner(a.id);
    expect(listA.length).toBe(1);
    expect(listA[0].patientName).toBe('Patient Pat');
  });

  it('markCartPaid sets status and is idempotent', async () => {
    const p = await seedApproved();
    const db = await import('@/lib/db');
    const c = await makeCart(p.id);
    await db.markCartPaid(c.id);
    let again = await db.getCartByToken('tok_abc');
    expect(again!.status).toBe('paid');
    expect(again!.paidAt).not.toBeNull();
    await db.markCartPaid(c.id);
    again = await db.getCartByToken('tok_abc');
    expect(again!.status).toBe('paid');
  });

  it('markCartSent sets status to sent', async () => {
    const p = await seedApproved();
    const db = await import('@/lib/db');
    const c = await makeCart(p.id);
    await db.markCartSent(c.id);
    const s = await db.getCartByToken('tok_abc');
    expect(s!.status).toBe('sent');
    expect(s!.sentAt).not.toBeNull();
  });
});
