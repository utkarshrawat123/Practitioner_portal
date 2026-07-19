import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-pay-api-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedCart() {
  const db = await import('@/lib/db');
  const p = await db.insertApplication({ name: 'Prac One', email: 'p@example.com', registerBody: 'BANT', registerNumber: '1', qualificationStatus: 'qualified' });
  await db.markApproved(p.id, { affiliateCode: `WN-${p.id}-AB2C`, affiliateLink: 'http://x', pendingSync: false, decidedBy: 'system' });
  const cart = await db.createPatientCart({
    practitionerId: p.id, patientName: 'Pat', patientEmail: null, token: 'paytok',
    provider: 'mock', externalId: 'mock-cart', payUrl: '/pay/paytok', currency: 'GBP',
    subtotal: 50, discountAmount: 5, total: 45, commissionAmount: 9,
    items: [{ productRef: 'x', title: 'X', imageUrl: null, unitPrice: 25, qty: 2 }],
  });
  return { p, cart };
}

describe('pay API', () => {
  it('GET 404 on unknown token, returns cart on good token', async () => {
    await seedCart();
    const { GET } = await import('@/app/api/pay/[token]/route');
    expect((await GET(new Request('http://x/api/pay/nope'), { params: { token: 'nope' } })).status).toBe(404);
    const ok = await GET(new Request('http://x/api/pay/paytok'), { params: { token: 'paytok' } });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.practitionerName).toBe('Prac One');
    expect(body.total).toBe(45);
    expect(body.items.length).toBe(1);
  });

  it('POST marks paid and records an order for the practitioner; idempotent', async () => {
    const { p } = await seedCart();
    const { POST } = await import('@/app/api/pay/[token]/route');
    const db = await import('@/lib/db');
    const code = `WN-${p.id}-AB2C`;
    const res = await POST(new Request('http://x/api/pay/paytok', { method: 'POST' }), { params: { token: 'paytok' } });
    expect(res.status).toBe(200);
    expect((await db.getCartByToken('paytok'))!.status).toBe('paid');
    const after1 = await db.execForTests('SELECT COUNT(*) AS n, SUM(total) AS t FROM orders WHERE code = ?', [code]);
    expect(Number(after1.rows[0].n)).toBe(1);
    expect(Number(after1.rows[0].t)).toBe(45);
    await POST(new Request('http://x/api/pay/paytok', { method: 'POST' }), { params: { token: 'paytok' } });
    const after2 = await db.execForTests('SELECT COUNT(*) AS n FROM orders WHERE code = ?', [code]);
    expect(Number(after2.rows[0].n)).toBe(1);
  });
});
