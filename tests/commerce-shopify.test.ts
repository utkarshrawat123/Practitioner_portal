import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getCatalog, createDraftOrder, CommerceError, MOCK_CATALOG } from '@/lib/commerce';

const realFetch = global.fetch;

beforeEach(() => {
  delete process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_ADMIN_TOKEN;
});

afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

function configureShopify(): void {
  process.env.SHOPIFY_STORE_DOMAIN = 'test-store.myshopify.com';
  process.env.SHOPIFY_ADMIN_TOKEN = 'shpat_test';
}

function stubFetch(response: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

const PRODUCTS_RESPONSE = {
  data: {
    products: {
      nodes: [
        {
          title: 'Magnesium',
          status: 'ACTIVE',
          featuredMedia: { preview: { image: { url: 'https://cdn.shopify.com/magnesium.jpg' } } },
          variants: { nodes: [{ id: 'gid://shopify/ProductVariant/111', price: '20.50' }] },
        },
        {
          title: 'Omega 3',
          status: 'ACTIVE',
          featuredMedia: { preview: { image: { url: 'https://cdn.shopify.com/omega3.jpg' } } },
          variants: { nodes: [{ id: 'gid://shopify/ProductVariant/222', price: '25.00' }] },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
};

describe('getCatalog', () => {
  it('returns the mock catalog when Shopify is not configured', async () => {
    expect(await getCatalog()).toBe(MOCK_CATALOG);
  });

  it('queries the Shopify Admin API and maps products to catalog entries', async () => {
    configureShopify();
    const mock = stubFetch(PRODUCTS_RESPONSE);

    const catalog = await getCatalog();

    expect(mock).toHaveBeenCalledOnce();
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toContain('test-store.myshopify.com/admin/api');
    expect((init.headers as Record<string, string>)['X-Shopify-Access-Token']).toBe('shpat_test');

    expect(catalog).toEqual([
      {
        id: 'gid://shopify/ProductVariant/111',
        title: 'Magnesium',
        imageUrl: 'https://cdn.shopify.com/magnesium.jpg',
        price: 20.5,
        currency: 'GBP',
      },
      {
        id: 'gid://shopify/ProductVariant/222',
        title: 'Omega 3',
        imageUrl: 'https://cdn.shopify.com/omega3.jpg',
        price: 25,
        currency: 'GBP',
      },
    ]);
  });

  it('falls back to the mock catalog when the Shopify API fails (read path degrades, never breaks)', async () => {
    configureShopify();
    stubFetch({ errors: [{ message: 'boom' }] }, false, 500);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await getCatalog()).toBe(MOCK_CATALOG);
    expect(errSpy).toHaveBeenCalled();
  });
});

const DRAFT_INPUT = {
  token: 'tok123',
  patientName: 'Pat Patient',
  patientEmail: 'pat@example.com',
  items: [{ productRef: 'gid://shopify/ProductVariant/111', title: 'Magnesium', unitPrice: 20.5, qty: 2 }],
  subtotal: 41,
  discountAmount: 4.1,
  total: 36.9,
  practitionerId: 7,
};

describe('createDraftOrder', () => {
  it('returns the mock pay link when Shopify is not configured', async () => {
    expect(await createDraftOrder(DRAFT_INPUT)).toEqual({ externalId: 'mock-cart', payUrl: '/pay/tok123' });
  });

  it('creates a Shopify draft order carrying the cart token and returns its invoice URL', async () => {
    configureShopify();
    const mock = stubFetch({
      data: {
        draftOrderCreate: {
          draftOrder: { id: 'gid://shopify/DraftOrder/999', invoiceUrl: 'https://test-store.myshopify.com/invoices/abc' },
          userErrors: [],
        },
      },
    });

    const result = await createDraftOrder(DRAFT_INPUT);
    expect(result).toEqual({ externalId: 'gid://shopify/DraftOrder/999', payUrl: 'https://test-store.myshopify.com/invoices/abc' });

    const body = JSON.parse(mock.mock.calls[0][1].body as string);
    expect(body.query).toContain('draftOrderCreate');
    const input = body.variables.input;
    expect(input.lineItems).toEqual([{ variantId: 'gid://shopify/ProductVariant/111', quantity: 2 }]);
    expect(input.email).toBe('pat@example.com');
    // The cart token MUST ride on the draft order so the orders webhook can
    // reconcile the paid order back to our patient_carts row.
    expect(input.customAttributes).toContainEqual({ key: 'wn_cart_token', value: 'tok123' });
    expect(input.appliedDiscount?.valueType).toBe('PERCENTAGE');
  });

  it('throws CommerceError on API failure — a practitioner must never unknowingly send a dead pay link', async () => {
    configureShopify();
    stubFetch({ data: { draftOrderCreate: { draftOrder: null, userErrors: [{ message: 'Variant not found' }] } } });
    await expect(createDraftOrder(DRAFT_INPUT)).rejects.toThrow(CommerceError);
  });

  it('throws CommerceError on HTTP failure too', async () => {
    configureShopify();
    stubFetch({ errors: 'throttled' }, false, 429);
    await expect(createDraftOrder(DRAFT_INPUT)).rejects.toThrow(CommerceError);
  });
});
