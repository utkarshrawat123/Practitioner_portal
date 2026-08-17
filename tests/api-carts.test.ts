import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-carts-api-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved(email = 'p@example.com') {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({ name: 'Prac One', email, registerBody: 'BANT', registerNumber: '12345', qualificationStatus: 'qualified' });
  await markApproved(p.id, { affiliateCode: `WN-${p.id}-AB2C`, affiliateLink: 'http://x', pendingSync: false, decidedBy: 'system' });
  return p;
}
async function pHeaders(id: number) {
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return { cookie: sessionCookieHeader(id).split(';')[0], 'Content-Type': 'application/json' };
}

describe('patient carts API', () => {
  it('GET /api/me/catalog 401 unauth, returns products when authed', async () => {
    const p = await seedApproved();
    const { GET } = await import('@/app/api/me/catalog/route');
    expect((await GET(new Request('http://x/api/me/catalog'))).status).toBe(401);
    const ok = await GET(new Request('http://x/api/me/catalog', { headers: await pHeaders(p.id) }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).products.length).toBeGreaterThan(0);
  });

  it('POST /api/me/carts recomputes totals server-side and ignores client prices', async () => {
    const p = await seedApproved();
    const { getCatalog } = await import('@/lib/commerce');
    const cat = await getCatalog();
    const { POST } = await import('@/app/api/me/carts/route');
    const res = await POST(new Request('http://x/api/me/carts', {
      method: 'POST', headers: await pHeaders(p.id),
      body: JSON.stringify({ patientName: 'Pat', patientEmail: 'pat@example.com',
        items: [{ productRef: cat[0].id, qty: 2, unitPrice: 0.01 }] }),
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.cart.subtotal).toBeCloseTo(cat[0].price * 2, 2);
    expect(body.payUrl).toMatch(/^\/pay\//);
  });

  it('POST /api/me/carts 400 on empty items', async () => {
    const p = await seedApproved();
    const { POST } = await import('@/app/api/me/carts/route');
    const res = await POST(new Request('http://x/api/me/carts', {
      method: 'POST', headers: await pHeaders(p.id), body: JSON.stringify({ patientName: 'Pat', items: [] }) }));
    expect(res.status).toBe(400);
  });

  it('GET /api/me/carts returns only the caller\'s carts', async () => {
    const a = await seedApproved('a@example.com');
    const b = await seedApproved('b@example.com');
    const { getCatalog } = await import('@/lib/commerce');
    const cat = await getCatalog();
    const { POST, GET } = await import('@/app/api/me/carts/route');
    await POST(new Request('http://x/api/me/carts', { method: 'POST', headers: await pHeaders(a.id),
      body: JSON.stringify({ patientName: 'A pat', items: [{ productRef: cat[0].id, qty: 1 }] }) }));
    const listB = await GET(new Request('http://x/api/me/carts', { headers: await pHeaders(b.id) }));
    expect((await listB.json()).carts.length).toBe(0);
  });

  it('POST /api/me/carts surfaces a 502 when the Shopify draft order fails (no silent mock link)', async () => {
    const p = await seedApproved();
    process.env.SHOPIFY_STORE_DOMAIN = 'test-store.myshopify.com';
    process.env.SHOPIFY_ADMIN_TOKEN = 'shpat_test';
    const realFetch = global.fetch;
    // Every Shopify call fails: the catalog read degrades to mock (so the item
    // resolves), but the draft-order WRITE must surface as an error response.
    global.fetch = (async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'boom' })) as unknown as typeof fetch;
    try {
      const { MOCK_CATALOG } = await import('@/lib/commerce');
      const { POST } = await import('@/app/api/me/carts/route');
      const res = await POST(new Request('http://x/api/me/carts', { method: 'POST', headers: await pHeaders(p.id),
        body: JSON.stringify({ patientName: 'Pat', items: [{ productRef: MOCK_CATALOG[0].id, qty: 1 }] }) }));
      expect(res.status).toBe(502);
      expect((await res.json()).error).toMatch(/store/i);
      // And no half-created cart is left behind.
      const { listPatientCartsForPractitioner } = await import('@/lib/db');
      expect((await listPatientCartsForPractitioner(p.id)).length).toBe(0);
    } finally {
      global.fetch = realFetch;
      delete process.env.SHOPIFY_STORE_DOMAIN;
      delete process.env.SHOPIFY_ADMIN_TOKEN;
    }
  });
});
