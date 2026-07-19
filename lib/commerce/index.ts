import type { CatalogProduct, DraftOrderInput, DraftOrderResult } from './types';
import { MOCK_CATALOG } from './catalog.mock';

export type { CatalogProduct, DraftOrderInput, DraftOrderResult, DraftOrderItem } from './types';
export { MOCK_CATALOG } from './catalog.mock';

export const DISCOUNT_PERCENT = Number(process.env.AFFILIATE_DISCOUNT_PERCENT ?? 10);
export const COMMISSION_PERCENT = Number(process.env.COMMISSION_PERCENT ?? 20);

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function priceCart(items: { unitPrice: number; qty: number }[]): {
  subtotal: number; discountAmount: number; total: number; commissionAmount: number;
} {
  const subtotal = round2(items.reduce((s, i) => s + i.unitPrice * i.qty, 0));
  const discountAmount = round2(subtotal * (DISCOUNT_PERCENT / 100));
  const total = round2(subtotal - discountAmount);
  const commissionAmount = round2(total * (COMMISSION_PERCENT / 100));
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
