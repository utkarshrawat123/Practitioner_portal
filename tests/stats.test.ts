import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-stats-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  delete process.env.COMMISSION_PERCENT;
  delete process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_ADMIN_TOKEN;
  (await import('@/lib/stats')).clearStatsCacheForTests();
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function seedApproved() {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name: 'Jane Smith', email: 'jane@example.com', registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus: 'qualified',
  });
  return markApproved(p.id, {
    affiliateCode: 'WN-SMITH-AB2C', affiliateLink: 'http://localhost:3100/r/WN-SMITH-AB2C',
    pendingSync: false, decidedBy: 'system',
  });
}

const richProvider = {
  name: 'fake',
  async getOrderStats() {
    return { ordersThisMonth: 2, ordersAllTime: 10, revenueThisMonth: 150, revenueAllTime: 1000 };
  },
};

describe('computeStats', () => {
  it('combines clicks, orders, commission (default 20%) and conversion rate', async () => {
    const p = await seedApproved();
    const { recordClick } = await import('@/lib/db');
    for (let i = 0; i < 5; i++) recordClick(p.id, p.affiliateCode!);
    const { computeStats } = await import('@/lib/stats');
    const s = await computeStats(p, richProvider);
    expect(s.clicksThisMonth).toBe(5);
    expect(s.clicksAllTime).toBe(5);
    expect(s.commissionThisMonth).toBe(30);   // 150 * 20%
    expect(s.commissionAllTime).toBe(200);    // 1000 * 20%
    expect(s.conversionRate).toBe(200);       // 10 orders / 5 clicks = 200.0%
    expect(s.stale).toBe(false);
  });

  it('respects COMMISSION_PERCENT and zero-click conversion', async () => {
    process.env.COMMISSION_PERCENT = '15';
    const p = await seedApproved();
    const { computeStats } = await import('@/lib/stats');
    const s = await computeStats(p, richProvider);
    expect(s.commissionAllTime).toBe(150);
    expect(s.conversionRate).toBe(0); // no clicks — no division by zero
  });

  it('mock provider yields all-zero stats, not stale', async () => {
    const p = await seedApproved();
    const { computeStats, getStatsProvider } = await import('@/lib/stats');
    expect(getStatsProvider().name).toBe('mock');
    const s = await computeStats(p);
    expect(s.ordersAllTime).toBe(0);
    expect(s.commissionAllTime).toBe(0);
    expect(s.stale).toBe(false);
  });

  it('caches per code for 60s (provider called once)', async () => {
    const p = await seedApproved();
    const spy = vi.fn(richProvider.getOrderStats);
    const { computeStats } = await import('@/lib/stats');
    await computeStats(p, { name: 'fake', getOrderStats: spy });
    await computeStats(p, { name: 'fake', getOrderStats: spy });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('degrades to zeros with stale=true when the provider fails with no cache', async () => {
    const p = await seedApproved();
    const { computeStats, clearStatsCacheForTests } = await import('@/lib/stats');
    const good = await computeStats(p, richProvider);
    expect(good.stale).toBe(false);
    clearStatsCacheForTests();
    const failing = { name: 'fake', async getOrderStats(): Promise<any> { throw new Error('api down'); } };
    const s = await computeStats(p, failing);
    expect(s.stale).toBe(true);
    expect(s.ordersAllTime).toBe(0);
  });
});
