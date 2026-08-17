import type { CatalogProduct, DraftOrderInput, DraftOrderResult } from './types';
import { MOCK_CATALOG } from './catalog.mock';

export type { CatalogProduct, DraftOrderInput, DraftOrderResult, DraftOrderItem } from './types';
export { MOCK_CATALOG } from './catalog.mock';

/** Parse a percentage env var, falling back to `def` for unset/empty/non-positive
 *  values (`Number('')` is 0 and `?? ` doesn't catch empty strings — this does). */
function pct(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export const DISCOUNT_PERCENT = pct(process.env.AFFILIATE_DISCOUNT_PERCENT, 10);
export const COMMISSION_PERCENT = pct(process.env.COMMISSION_PERCENT, 20);

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function priceCart(items: { unitPrice: number; qty: number }[]): {
  subtotal: number; discountAmount: number; total: number; commissionAmount: number;
} {
  // Read at call-time so a runtime env (or an empty-string override) resolves correctly.
  const discountPct = pct(process.env.AFFILIATE_DISCOUNT_PERCENT, 10);
  const commissionPct = pct(process.env.COMMISSION_PERCENT, 20);
  const subtotal = round2(items.reduce((s, i) => s + i.unitPrice * i.qty, 0));
  const discountAmount = round2(subtotal * (discountPct / 100));
  const total = round2(subtotal - discountAmount);
  const commissionAmount = round2(total * (commissionPct / 100));
  return { subtotal, discountAmount, total, commissionAmount };
}

/** 'shopify' when store creds are set, else 'mock' (the demo default). */
export function commerceProvider(): 'shopify' | 'mock' {
  return process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_TOKEN ? 'shopify' : 'mock';
}

/** A write against the commerce provider failed. Routes surface this as a 502. */
export class CommerceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommerceError';
  }
}

const API_VERSION = '2024-07'; // matches lib/providers/affiliates.ts

async function shopifyGraphql(query: string, variables: Record<string, unknown>): Promise<Record<string, any>> {
  const res = await fetch(
    `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN!,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) throw new CommerceError(`Shopify API ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (body.errors) throw new CommerceError(`Shopify GraphQL errors: ${JSON.stringify(body.errors)}`);
  return body;
}

const PRODUCTS_QUERY = `
  query catalog($after: String) {
    products(first: 100, after: $after, query: "status:active") {
      nodes {
        title
        status
        featuredMedia { preview { image { url } } }
        variants(first: 1) { nodes { id price } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

async function shopifyCatalog(): Promise<CatalogProduct[]> {
  const out: CatalogProduct[] = [];
  let after: string | null = null;
  do {
    const body = await shopifyGraphql(PRODUCTS_QUERY, { after });
    const conn = body.data.products;
    for (const node of conn.nodes) {
      const variant = node.variants?.nodes?.[0];
      if (!variant) continue; // no purchasable variant → not orderable
      out.push({
        // The FIRST VARIANT's GID, not the product's — draftOrderCreate line
        // items take variant ids, so the catalog id is directly orderable.
        id: variant.id,
        title: node.title,
        imageUrl: node.featuredMedia?.preview?.image?.url ?? '',
        price: Number(variant.price),
        currency: 'GBP',
      });
    }
    after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (after);
  return out;
}

export async function getCatalog(): Promise<CatalogProduct[]> {
  if (commerceProvider() === 'shopify') {
    // Read path degrades, never breaks: a Shopify outage must not blank the
    // practitioner's cart builder. Writes (createDraftOrder) fail loudly instead.
    try {
      return await shopifyCatalog();
    } catch (err) {
      console.error('[commerce] Shopify catalog failed, serving mock catalog:', (err as Error).message);
      return MOCK_CATALOG;
    }
  }
  return MOCK_CATALOG;
}

const DRAFT_ORDER_MUTATION = `
  mutation draftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder { id invoiceUrl }
      userErrors { field message }
    }
  }`;

export async function createDraftOrder(input: DraftOrderInput): Promise<DraftOrderResult> {
  if (commerceProvider() !== 'shopify') {
    // Mock: the pay link is our own branded page keyed by the cart token.
    return { externalId: 'mock-cart', payUrl: `/pay/${input.token}` };
  }

  const discountPct = pct(process.env.AFFILIATE_DISCOUNT_PERCENT, 10);
  const body = await shopifyGraphql(DRAFT_ORDER_MUTATION, {
    input: {
      lineItems: input.items.map((i) => ({ variantId: i.productRef, quantity: i.qty })),
      ...(input.patientEmail ? { email: input.patientEmail } : {}),
      appliedDiscount: {
        title: 'Practitioner patient discount',
        valueType: 'PERCENTAGE',
        value: discountPct,
      },
      // Custom attributes propagate to the completed order's note_attributes —
      // /api/webhooks/shopify reconciles the paid order back to patient_carts
      // via wn_cart_token. This is the ONLY link between the two systems.
      customAttributes: [
        { key: 'wn_cart_token', value: input.token },
        { key: 'wn_practitioner_id', value: String(input.practitionerId) },
      ],
      tags: ['practitioner-portal'],
    },
  });

  const result = body.data?.draftOrderCreate;
  const userErrors = result?.userErrors ?? [];
  if (!result?.draftOrder || userErrors.length > 0) {
    // Fail LOUDLY: silently minting a mock pay link here would hand the
    // practitioner a link their patient can never actually pay on.
    throw new CommerceError(
      `Shopify draft order failed: ${JSON.stringify(userErrors.length ? userErrors : 'no draftOrder returned')}`
    );
  }
  return { externalId: result.draftOrder.id, payUrl: result.draftOrder.invoiceUrl };
}
