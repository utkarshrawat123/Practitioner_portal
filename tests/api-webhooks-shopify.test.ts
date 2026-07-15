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
