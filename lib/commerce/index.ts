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

export async function getCatalog(): Promise<CatalogProduct[]> {
  // The shopify branch (products API) is future work; the demo returns the mock catalog.
  return MOCK_CATALOG;
}

/** Mock: the pay link is our own branded page keyed by the cart token. */
export async function createDraftOrder(input: DraftOrderInput): Promise<DraftOrderResult> {
  return { externalId: 'mock-cart', payUrl: `/pay/${input.token}` };
}
