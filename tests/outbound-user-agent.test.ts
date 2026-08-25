import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let saved: string | undefined;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  saved = process.env.SUPPORT_EMAIL;
  delete process.env.SUPPORT_EMAIL;
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  if (saved === undefined) delete process.env.SUPPORT_EMAIL;
  else process.env.SUPPORT_EMAIL = saved;
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function captureUserAgent(): () => string {
  let seen = '';
  globalThis.fetch = vi.fn(async (_url: unknown, init?: { headers?: Record<string, string> }) => {
    seen = init?.headers?.['User-Agent'] ?? '';
    return new Response('<html></html>', { status: 200 });
  }) as unknown as typeof fetch;
  return () => seen;
}

describe('register lookups', () => {
  it('send no personal address in the User-Agent when SUPPORT_EMAIL is unset', async () => {
    const seen = captureUserAgent();
    const { politeFetch } = await import('@/lib/registers/http');
    await politeFetch('https://example.org/register');

    expect(seen()).toContain('WildNutritionPractitionerPortal/1.0');
    expect(seen()).not.toMatch(/gmail\.com/i);
    expect(seen()).not.toContain('@');
  });

  it('include the configured contact when SUPPORT_EMAIL is set', async () => {
    process.env.SUPPORT_EMAIL = 'practitioners@example.org';
    const seen = captureUserAgent();
    const { politeFetch } = await import('@/lib/registers/http');
    await politeFetch('https://example.org/register');

    expect(seen()).toContain('+practitioners@example.org');
    expect(seen()).toContain('membership verification');
  });
});
