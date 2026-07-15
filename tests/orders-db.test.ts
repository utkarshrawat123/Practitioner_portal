import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-orders-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

const now = new Date().toISOString();

describe('orders db', () => {
  it('records orders and aggregates stats by code', async () => {
    const db = await import('@/lib/db');
    await db.recordOrder({ orderId: 'gid://1', practitionerId: null, code: 'WN-SMITH-AB2C', total: 40, currency: 'GBP', financialStatus: 'paid', createdAt: now });
    await db.recordOrder({ orderId: 'gid://2', practitionerId: null, code: 'WN-SMITH-AB2C', total: 60, currency: 'GBP', financialStatus: 'paid', createdAt: now });
    const s = await db.orderStatsByCode('WN-SMITH-AB2C');
    expect(s.ordersAllTime).toBe(2);
    expect(s.revenueAllTime).toBe(100);
    expect(s.ordersThisMonth).toBe(2);
    expect(s.revenueThisMonth).toBe(100);
  });

  it('is idempotent — replaying the same order id does not double-count', async () => {
    const db = await import('@/lib/db');
    await db.recordOrder({ orderId: 'gid://9', practitionerId: null, code: 'WN-X-1', total: 25, currency: 'GBP', financialStatus: 'paid', createdAt: now });
    await db.recordOrder({ orderId: 'gid://9', practitionerId: null, code: 'WN-X-1', total: 25, currency: 'GBP', financialStatus: 'paid', createdAt: now });
    const s = await db.orderStatsByCode('WN-X-1');
    expect(s.ordersAllTime).toBe(1);
    expect(s.revenueAllTime).toBe(25);
  });

  it('excludes orders older than 12 months from referral data but keeps last-ever timestamp', async () => {
    const db = await import('@/lib/db');
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    await db.recordOrder({ orderId: 'old', practitionerId: null, code: 'WN-Y-2', total: 100, currency: 'GBP', financialStatus: 'paid', createdAt: old });
    await db.recordOrder({ orderId: 'new', practitionerId: null, code: 'WN-Y-2', total: 30, currency: 'GBP', financialStatus: 'paid', createdAt: now });
    const r = await db.referralDataByCode('WN-Y-2');
    expect(r.revenue12mo).toBe(30);
    expect(r.orders12mo).toBe(1);
    expect(r.lastReferralAt).toBe(now); // most recent of the two
  });
});
