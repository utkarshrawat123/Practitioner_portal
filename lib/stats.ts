import { clickStats, countCompletions, type Practitioner } from '@/lib/db';

export interface OrderStats {
  ordersThisMonth: number;
  ordersAllTime: number;
  revenueThisMonth: number;
  revenueAllTime: number;
}

export interface StatsProvider {
  name: string;
  /** Throws on API failure — computeStats handles degradation. */
  getOrderStats(code: string): Promise<OrderStats>;
}

export interface DashboardStats extends OrderStats {
  clicksThisMonth: number;
  clicksAllTime: number;
  commissionThisMonth: number;
  commissionAllTime: number;
  conversionRate: number;
  lessonsCompleted: number;
  stale: boolean;
}

const ZERO_ORDERS: OrderStats = {
  ordersThisMonth: 0, ordersAllTime: 0, revenueThisMonth: 0, revenueAllTime: 0,
};

const mockStats: StatsProvider = {
  name: 'mock',
  async getOrderStats() {
    return { ...ZERO_ORDERS };
  },
};

/** Sums orders carrying the discount code via the Shopify Admin GraphQL API. */
const shopifyStats: StatsProvider = {
  name: 'shopify',
  async getOrderStats(code: string): Promise<OrderStats> {
    const domain = process.env.SHOPIFY_STORE_DOMAIN!;
    const token = process.env.SHOPIFY_ADMIN_TOKEN!;
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const result = { ...ZERO_ORDERS };
    let after: string | null = null;
    do {
      const res: Response = await fetch(`https://${domain}/admin/api/2024-07/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({
          query: `query($q: String!, $after: String) {
            orders(first: 250, query: $q, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes { createdAt currentTotalPriceSet { shopMoney { amount } } }
            }
          }`,
          variables: { q: `discount_code:${code}`, after },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Shopify orders query failed (${res.status})`);
      const body = await res.json();
      if (body.errors) throw new Error(`Shopify orders query errors: ${JSON.stringify(body.errors)}`);
      const conn = body.data.orders;
      for (const node of conn.nodes) {
        const amount = Number(node.currentTotalPriceSet.shopMoney.amount);
        result.ordersAllTime += 1;
        result.revenueAllTime += amount;
        if (String(node.createdAt).startsWith(monthPrefix)) {
          result.ordersThisMonth += 1;
          result.revenueThisMonth += amount;
        }
      }
      after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    } while (after);
    return result;
  },
};

export function getStatsProvider(): StatsProvider {
  if (process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_TOKEN) return shopifyStats;
  return mockStats;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; data: DashboardStats }>();

export function clearStatsCacheForTests(): void {
  cache.clear();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function computeStats(
  practitioner: Practitioner,
  provider: StatsProvider = getStatsProvider()
): Promise<DashboardStats> {
  const code = practitioner.affiliateCode ?? '';
  // Local-DB figures (clicks, lesson completions) are always fresh — only the
  // Shopify order pull is cached, so merge these in on every return path.
  const clicks = await clickStats(practitioner.id);
  const lessonsCompleted = await countCompletions(practitioner.id);

  const cached = cache.get(code);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.data, ...clicks, lessonsCompleted };
  }

  let orders: OrderStats;
  let stale = false;
  try {
    orders = await provider.getOrderStats(code);
  } catch {
    if (cached) return { ...cached.data, ...clicks, lessonsCompleted, stale: true };
    orders = { ...ZERO_ORDERS };
    stale = true;
  }

  const percent = Number(process.env.COMMISSION_PERCENT || '20');
  const data: DashboardStats = {
    ...clicks,
    ...orders,
    commissionThisMonth: round2((orders.revenueThisMonth * percent) / 100),
    commissionAllTime: round2((orders.revenueAllTime * percent) / 100),
    conversionRate:
      clicks.clicksAllTime > 0
        ? Math.round((orders.ordersAllTime / clicks.clicksAllTime) * 1000) / 10
        : 0,
    lessonsCompleted,
    stale,
  };
  if (!stale) cache.set(code, { at: Date.now(), data });
  return data;
}
