import type { AffiliateProvider, SyncResult } from './types';

const mockAffiliate: AffiliateProvider = {
  name: 'mock',
  async createAffiliate({ code, name, email }): Promise<SyncResult> {
    console.log(`[mock affiliate] would create Shopify discount code ${code} for ${name} <${email}>`);
    return { ok: true, detail: `Mock mode: discount code ${code} recorded locally only.` };
  },
};

/**
 * Shopify Collabs has no write API, so we create a plain Shopify discount code
 * via the Admin GraphQL API; the /discount/{code} referral link applies it and
 * UTM params make attribution reportable.
 */
const shopifyAffiliate: AffiliateProvider = {
  name: 'shopify',
  async createAffiliate({ code, name }): Promise<SyncResult> {
    const domain = process.env.SHOPIFY_STORE_DOMAIN!;
    const token = process.env.SHOPIFY_ADMIN_TOKEN!;
    const percent = Number(process.env.AFFILIATE_DISCOUNT_PERCENT || '10');
    const mutation = `
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode { id }
          userErrors { field message }
        }
      }`;
    const variables = {
      basicCodeDiscount: {
        title: `Practitioner referral — ${name} (${code})`,
        code,
        startsAt: new Date().toISOString(),
        customerSelection: { all: true },
        customerGets: {
          value: { percentage: percent / 100 },
          items: { all: true },
        },
      },
    };
    try {
      const res = await fetch(`https://${domain}/admin/api/2024-07/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ query: mutation, variables }),
        signal: AbortSignal.timeout(10000),
      });
      const body = await res.json();
      const errors = body?.data?.discountCodeBasicCreate?.userErrors ?? [];
      if (!res.ok || body.errors || errors.length > 0) {
        return {
          ok: false,
          detail: `Shopify discount creation failed: ${JSON.stringify(body.errors ?? errors)}`,
        };
      }
      return { ok: true, detail: `Shopify discount code ${code} created (${percent}% off).` };
    } catch (err) {
      return { ok: false, detail: `Shopify request error: ${(err as Error).message}` };
    }
  },
};

export function getAffiliateProvider(): AffiliateProvider {
  if (process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_TOKEN) {
    return shopifyAffiliate;
  }
  return mockAffiliate;
}
