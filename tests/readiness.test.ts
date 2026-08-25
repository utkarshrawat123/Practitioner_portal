import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readinessReport } from '@/lib/readiness';

const KEYS = [
  'R2_PUBLIC_BASE', 'ADMIN_PASSWORD', 'SESSION_SECRET', 'CRON_SECRET', 'PORTAL_URL',
  'RESEND_API_KEY', 'EMAIL_FROM', 'GEMINI_API_KEY', 'GEMINI_API_KEY2', 'ANTHROPIC_API_KEY',
  'SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ADMIN_TOKEN', 'SHOPIFY_WEBHOOK_SECRET', 'SENTRY_DSN',
  'SUPPORT_EMAIL', 'NEXT_PUBLIC_FB_GROUP_URL', 'CLOUDFLARE_D1_ID',
];

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

function find(report: ReturnType<typeof readinessReport>, key: string) {
  return report.checks.find((c) => c.key === key)!;
}

describe('readinessReport', () => {
  it('is not go-live ready with nothing configured', () => {
    const r = readinessReport();
    expect(r.ready).toBe(false);
    expect(r.missingRequired.length).toBeGreaterThan(0);
  });

  it('reports each integration as live or mock without ever exposing a value', () => {
    process.env.RESEND_API_KEY = 'super-secret-key';
    process.env.EMAIL_FROM = 'hello@example.com';
    const r = readinessReport();
    const email = find(r, 'email');
    expect(email.status).toBe('live');
    // A readiness endpoint must never leak secrets, even to an authed admin.
    expect(JSON.stringify(r)).not.toContain('super-secret-key');
  });

  it('treats email as mock until BOTH the key and a verified sender are set', () => {
    process.env.RESEND_API_KEY = 'k';
    expect(find(readinessReport(), 'email').status).toBe('mock');
    process.env.EMAIL_FROM = 'hello@example.com';
    expect(find(readinessReport(), 'email').status).toBe('live');
  });

  it('treats Shopify as mock until BOTH store domain and admin token are set', () => {
    process.env.SHOPIFY_STORE_DOMAIN = 'x.myshopify.com';
    expect(find(readinessReport(), 'commerce').status).toBe('mock');
    process.env.SHOPIFY_ADMIN_TOKEN = 't';
    expect(find(readinessReport(), 'commerce').status).toBe('live');
  });

  it('flags Shopify configured without a webhook secret — orders would never reconcile', () => {
    process.env.SHOPIFY_STORE_DOMAIN = 'x.myshopify.com';
    process.env.SHOPIFY_ADMIN_TOKEN = 't';
    const r = readinessReport();
    expect(find(r, 'shopify_webhook').status).toBe('missing');
    expect(r.warnings.join(' ')).toMatch(/webhook/i);
  });

  it('accepts either Gemini or Anthropic for the AI check', () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    expect(find(readinessReport(), 'ai').status).toBe('live');
  });

  it('reports the D1 and R2 bindings as missing off-Workers', () => {
    const r = readinessReport();
    expect(find(r, 'database').status).toBe('missing');
    expect(find(r, 'storage').status).toBe('missing');
  });

  it('becomes ready once every required item is configured', () => {
    for (const k of ['R2_PUBLIC_BASE', 'ADMIN_PASSWORD', 'SESSION_SECRET', 'CRON_SECRET', 'PORTAL_URL', 'EMAIL_FROM', 'SUPPORT_EMAIL', 'CLOUDFLARE_D1_ID']) {
      process.env[k] = 'set';
    }
    process.env.RESEND_API_KEY = 'k';
    process.env.GEMINI_API_KEY = 'k';
    // Bindings only exist on Workers, so inject them for this assertion.
    const r = readinessReport({ hasD1: true, hasR2: true });
    expect(r.missingRequired).toEqual([]);
    expect(r.ready).toBe(true);
  });
});
