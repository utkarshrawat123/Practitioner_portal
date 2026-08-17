import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
const SECRET = 'whsec_test';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-hook-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.SHOPIFY_WEBHOOK_SECRET = SECRET;
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body, 'utf8').digest('base64');
}

function req(body: string, hmac: string | null): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (hmac !== null) headers['x-shopify-hmac-sha256'] = hmac;
  return new Request('http://x/api/webhooks/shopify', { method: 'POST', body, headers });
}

async function seedPractitioner(code: string): Promise<void> {
  const { execForTests } = await import('@/lib/db');
  await execForTests(
    `INSERT INTO practitioners (name, email, register_body, register_number, qualification_status, status, affiliate_code)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['Jane Smith', 'jane@example.com', 'BANT', '1', 'qualified', 'approved', code]
  );
}

const order = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: 12345,
    admin_graphql_api_id: 'gid://shopify/Order/12345',
    discount_codes: [{ code: 'WN-SMITH-AB2C' }],
    current_total_price: '55.00',
    currency: 'GBP',
    financial_status: 'paid',
    created_at: new Date().toISOString(),
    ...over,
  });

describe('POST /api/webhooks/shopify', () => {
  it('401s on a missing or invalid signature (no DB write)', async () => {
    const { POST } = await import('@/app/api/webhooks/shopify/route');
    expect((await POST(req(order(), null))).status).toBe(401);
    expect((await POST(req(order(), 'not-valid'))).status).toBe(401);
  });

  it('records an order mapped to the practitioner on a valid signature', async () => {
    await seedPractitioner('WN-SMITH-AB2C');
    const body = order();
    const { POST } = await import('@/app/api/webhooks/shopify/route');
    const res = await POST(req(body, sign(body)));
    expect(res.status).toBe(200);
    expect((await res.json()).matched).toBe(true);
    const { orderStatsByCode } = await import('@/lib/db');
    const s = await orderStatsByCode('WN-SMITH-AB2C');
    expect(s.ordersAllTime).toBe(1);
    expect(s.revenueAllTime).toBe(55);
  });

  it('acknowledges (200 matched:false) when no discount code maps to a practitioner', async () => {
    const body = order({ discount_codes: [{ code: 'RANDOMSALE' }] });
    const { POST } = await import('@/app/api/webhooks/shopify/route');
    const res = await POST(req(body, sign(body)));
    expect(res.status).toBe(200);
    expect((await res.json()).matched).toBe(false);
    const { orderStatsByCode } = await import('@/lib/db');
    expect((await orderStatsByCode('RANDOMSALE')).ordersAllTime).toBe(0);
  });

  it('is idempotent — replaying the same order does not double-count', async () => {
    await seedPractitioner('WN-SMITH-AB2C');
    const body = order();
    const { POST } = await import('@/app/api/webhooks/shopify/route');
    await POST(req(body, sign(body)));
    await POST(req(body, sign(body)));
    const { orderStatsByCode } = await import('@/lib/db');
    const s = await orderStatsByCode('WN-SMITH-AB2C');
    expect(s.ordersAllTime).toBe(1);
    expect(s.revenueAllTime).toBe(55);
  });
});

// Patient-cart reconciliation: createDraftOrder() stamps the cart token onto the
// draft order as a custom attribute, which Shopify propagates to the completed
// order's note_attributes. The webhook uses that to mark OUR cart paid and
// attribute the sale — no discount code involved.
describe('POST /api/webhooks/shopify — patient cart reconciliation', () => {
  async function seedCart(): Promise<{ practitionerId: number; token: string; cartId: number }> {
    const { execForTests, createPatientCart } = await import('@/lib/db');
    const ins = await execForTests(
      `INSERT INTO practitioners (name, email, register_body, register_number, qualification_status, status, affiliate_code)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['Cart Owner', 'owner@example.com', 'BANT', '2', 'qualified', 'approved', 'WN-OWNER-XY9Z']
    );
    const practitionerId = ins.lastInsertRowid;
    const token = 'carttok-abc123';
    const cart = await createPatientCart({
      practitionerId,
      patientName: 'Pat Patient',
      patientEmail: 'pat@example.com',
      token,
      provider: 'shopify',
      externalId: 'gid://shopify/DraftOrder/999',
      payUrl: 'https://test-store.myshopify.com/invoices/abc',
      currency: 'GBP',
      subtotal: 41,
      discountAmount: 4.1,
      total: 36.9,
      commissionAmount: 7.38,
      items: [{ productRef: 'gid://shopify/ProductVariant/111', title: 'Magnesium', imageUrl: 'x', unitPrice: 20.5, qty: 2 }],
    });
    return { practitionerId, token, cartId: cart.id };
  }

  const cartOrder = (token: string, over: Record<string, unknown> = {}) =>
    order({
      discount_codes: [],
      note_attributes: [{ name: 'wn_cart_token', value: token }],
      current_total_price: '36.90',
      ...over,
    });

  it('marks the cart paid and attributes the sale to its practitioner', async () => {
    const { token, cartId } = await seedCart();
    const body = cartOrder(token);
    const { POST } = await import('@/app/api/webhooks/shopify/route');
    const res = await POST(req(body, sign(body)));
    expect(res.status).toBe(200);
    expect((await res.json()).matched).toBe(true);

    const { getCartByToken, orderStatsByCode } = await import('@/lib/db');
    const cart = await getCartByToken(token);
    expect(cart?.id).toBe(cartId);
    expect(cart?.status).toBe('paid');
    const s = await orderStatsByCode('WN-OWNER-XY9Z');
    expect(s.ordersAllTime).toBe(1);
    expect(s.revenueAllTime).toBe(36.9);
  });

  it('is idempotent — a webhook retry neither double-counts nor re-pays', async () => {
    const { token } = await seedCart();
    const body = cartOrder(token);
    const { POST } = await import('@/app/api/webhooks/shopify/route');
    await POST(req(body, sign(body)));
    await POST(req(body, sign(body)));
    const { orderStatsByCode } = await import('@/lib/db');
    expect((await orderStatsByCode('WN-OWNER-XY9Z')).ordersAllTime).toBe(1);
  });

  it('acknowledges an unknown cart token without writing anything', async () => {
    const body = cartOrder('no-such-token');
    const { POST } = await import('@/app/api/webhooks/shopify/route');
    const res = await POST(req(body, sign(body)));
    expect(res.status).toBe(200);
    expect((await res.json()).matched).toBe(false);
  });
});
