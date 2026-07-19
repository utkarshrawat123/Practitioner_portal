import { describe, it, expect } from 'vitest';

describe('commerce mock provider', () => {
  it('provider is mock without Shopify env', async () => {
    delete process.env.SHOPIFY_STORE_DOMAIN;
    delete process.env.SHOPIFY_ADMIN_TOKEN;
    const { commerceProvider } = await import('@/lib/commerce');
    expect(commerceProvider()).toBe('mock');
  });

  it('catalog has products with positive GBP prices and https images', async () => {
    const { getCatalog } = await import('@/lib/commerce');
    const products = await getCatalog();
    expect(products.length).toBeGreaterThanOrEqual(6);
    for (const p of products) {
      expect(p.price).toBeGreaterThan(0);
      expect(p.currency).toBe('GBP');
      expect(p.imageUrl).toMatch(/^https:\/\//);
      expect(p.title.length).toBeGreaterThan(0);
    }
  });

  it('priceCart applies 10% discount and 20% commission, rounded', async () => {
    const { priceCart } = await import('@/lib/commerce');
    const r = priceCart([{ unitPrice: 29.6, qty: 2 }, { unitPrice: 15.5, qty: 1 }]); // 74.70
    expect(r.subtotal).toBe(74.7);
    expect(r.discountAmount).toBe(7.47);
    expect(r.total).toBe(67.23);
    expect(r.commissionAmount).toBe(13.45);
  });

  it('createDraftOrder (mock) returns our /pay/{token} link', async () => {
    const { createDraftOrder } = await import('@/lib/commerce');
    const res = await createDraftOrder({
      token: 'abc123', patientName: 'Pat', patientEmail: null,
      items: [{ productRef: 'x', title: 'X', unitPrice: 10, qty: 1 }],
      subtotal: 10, discountAmount: 1, total: 9, practitionerId: 1,
    });
    expect(res.externalId).toBe('mock-cart');
    expect(res.payUrl).toBe('/pay/abc123');
  });
});
