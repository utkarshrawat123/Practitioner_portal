import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getAffiliateProvider } from '@/lib/providers/affiliates';
import { getEmailProvider } from '@/lib/providers/email';

beforeEach(() => {
  delete process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_ADMIN_TOKEN;
  delete process.env.MAILCHIMP_API_KEY;
  delete process.env.MAILCHIMP_AUDIENCE_ID;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
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

  it('prefers Resend for email when configured (transactional-capable)', () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'Wild Nutrition <hi@example.com>';
    // Even with Mailchimp present, Resend wins because it can send login links.
    process.env.MAILCHIMP_API_KEY = 'key-us21';
    process.env.MAILCHIMP_AUDIENCE_ID = 'abc123';
    expect(getEmailProvider().name).toBe('resend');
  });

  it('uses Gmail SMTP when configured and Resend is not', () => {
    process.env.GMAIL_USER = 'sender@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop';
    process.env.MAILCHIMP_API_KEY = 'key-us21';
    process.env.MAILCHIMP_AUDIENCE_ID = 'abc123';
    // SMTP beats Mailchimp (real transactional mail), but loses to Resend.
    expect(getEmailProvider().name).toBe('smtp');
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

  it('resend welcome sends via the API and reports success', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'Wild Nutrition <hi@example.com>';
    const fetchMock = vi.fn(async () => new Response('{"id":"abc"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await getEmailProvider().sendWelcome({
      name: 'Jane Smith', email: 'jane@example.com',
      code: 'WN-SMITH-AB2C', link: 'https://example.com/r/WN-SMITH-AB2C',
    });
    expect(res.ok).toBe(true);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.html).toContain('WN-SMITH-AB2C');
  });

  it('resend welcome returns ok=false on API failure (never throws)', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'Wild Nutrition <hi@example.com>';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"bad"}', { status: 422 })));
    const res = await getEmailProvider().sendWelcome({
      name: 'Jane Smith', email: 'jane@example.com',
      code: 'WN-SMITH-AB2C', link: 'https://example.com',
    });
    expect(res.ok).toBe(false);
  });
});
