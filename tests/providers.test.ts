import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getAffiliateProvider } from '@/lib/providers/affiliates';
import { getEmailProvider } from '@/lib/providers/email';

beforeEach(() => {
  delete process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_ADMIN_TOKEN;
  delete process.env.MAILCHIMP_API_KEY;
  delete process.env.MAILCHIMP_AUDIENCE_ID;
});
afterEach(() => vi.unstubAllGlobals());

describe('provider selection', () => {
  it('falls back to mocks without credentials', () => {
    expect(getAffiliateProvider().name).toBe('mock');
    expect(getEmailProvider().name).toBe('mock');
  });

  it('selects live providers when credentials exist', () => {
    process.env.SHOPIFY_STORE_DOMAIN = 'example.myshopify.com';
    process.env.SHOPIFY_ADMIN_TOKEN = 'shpat_test';
    process.env.MAILCHIMP_API_KEY = 'key-us21';
    process.env.MAILCHIMP_AUDIENCE_ID = 'abc123';
    expect(getAffiliateProvider().name).toBe('shopify');
    expect(getEmailProvider().name).toBe('mailchimp');
  });
});

describe('mock providers', () => {
  it('mock affiliate succeeds and echoes the code', async () => {
    const res = await getAffiliateProvider().createAffiliate({
      code: 'WN-SMITH-AB2C', name: 'Jane Smith', email: 'jane@example.com',
    });
    expect(res.ok).toBe(true);
    expect(res.detail).toContain('WN-SMITH-AB2C');
  });

  it('mock email succeeds and echoes the recipient', async () => {
    const res = await getEmailProvider().sendWelcome({
      name: 'Jane Smith', email: 'jane@example.com',
      code: 'WN-SMITH-AB2C', link: 'https://example.com',
    });
    expect(res.ok).toBe(true);
    expect(res.detail).toContain('jane@example.com');
  });
});

describe('live providers degrade gracefully', () => {
  it('shopify returns ok=false on API failure (never throws)', async () => {
    process.env.SHOPIFY_STORE_DOMAIN = 'example.myshopify.com';
    process.env.SHOPIFY_ADMIN_TOKEN = 'shpat_test';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
    const res = await getAffiliateProvider().createAffiliate({
      code: 'WN-SMITH-AB2C', name: 'Jane Smith', email: 'jane@example.com',
    });
    expect(res.ok).toBe(false);
  });

  it('mailchimp returns ok=false on API failure (never throws)', async () => {
    process.env.MAILCHIMP_API_KEY = 'key-us21';
    process.env.MAILCHIMP_AUDIENCE_ID = 'abc123';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"title":"Invalid"}', { status: 401 })));
    const res = await getEmailProvider().sendWelcome({
      name: 'Jane Smith', email: 'jane@example.com',
      code: 'WN-SMITH-AB2C', link: 'https://example.com',
    });
    expect(res.ok).toBe(false);
  });
});
