import {
  aiQueryCount,
  clickWindows,
  countCompletions,
  loginStats,
  type Practitioner,
} from '@/lib/db';

export interface ReferralData {
  revenue12mo: number;
  orders12mo: number;
  lastReferralAt: string | null;
}

export interface ReferralDataProvider {
  name: string;
  getReferralData(code: string): Promise<ReferralData>;
}

const ZERO: ReferralData = { revenue12mo: 0, orders12mo: 0, lastReferralAt: null };

const mockProvider: ReferralDataProvider = {
  name: 'mock',
  async getReferralData() {
    return { ...ZERO };
  },
};

/** Sums orders on a discount code within the trailing 12 months via the Shopify Admin API. */
const shopifyProvider: ReferralDataProvider = {
  name: 'shopify',
  async getReferralData(code: string): Promise<ReferralData> {
    const domain = process.env.SHOPIFY_STORE_DOMAIN!;
    const token = process.env.SHOPIFY_ADMIN_TOKEN!;
    const since = new Date(Date.now() - 365 * 86400000).toISOString();
    const result: ReferralData = { revenue12mo: 0, orders12mo: 0, lastReferralAt: null };
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
          variables: { q: `discount_code:${code} created_at:>=${since}`, after },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Shopify orders query failed (${res.status})`);
      const body = await res.json();
      if (body.errors) throw new Error(`Shopify errors: ${JSON.stringify(body.errors)}`);
      const conn = body.data.orders;
      for (const node of conn.nodes) {
        result.orders12mo += 1;
        result.revenue12mo += Number(node.currentTotalPriceSet.shopMoney.amount);
        if (!result.lastReferralAt || node.createdAt > result.lastReferralAt) {
          result.lastReferralAt = node.createdAt;
        }
      }
      after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    } while (after);
    return result;
  },
};

export function getReferralDataProvider(): ReferralDataProvider {
  if (process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_TOKEN) return shopifyProvider;
  return mockProvider;
}

export interface PractitionerSignals {
  referral: ReferralData;
  logins: { last30: number; prior30: number; lastAt: string | null };
  clicks: { last30: number; prior30: number; total: number; lastAt: string | null };
  lessonsCompleted: number;
  aiQueries30: number;
  dataWarning: boolean;
}

export async function gatherSignals(
  p: Practitioner,
  provider: ReferralDataProvider
): Promise<PractitionerSignals> {
  let referral: ReferralData = { ...ZERO };
  let dataWarning = false;
  if (p.affiliateCode) {
    try {
      referral = await provider.getReferralData(p.affiliateCode);
    } catch {
      dataWarning = true;
    }
  }
  return {
    referral,
    logins: loginStats(p.id),
    clicks: clickWindows(p.id),
    lessonsCompleted: countCompletions(p.id),
    aiQueries30: aiQueryCount(p.id, 30),
    dataWarning,
  };
}
