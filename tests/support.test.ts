import { describe, it, expect, beforeEach, afterEach } from 'vitest';

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    SUPPORT_EMAIL: process.env.SUPPORT_EMAIL,
    NEXT_PUBLIC_FB_GROUP_URL: process.env.NEXT_PUBLIC_FB_GROUP_URL,
  };
  delete process.env.SUPPORT_EMAIL;
  delete process.env.NEXT_PUBLIC_FB_GROUP_URL;
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('supportEmail', () => {
  it('returns null when SUPPORT_EMAIL is unset', async () => {
    const { supportEmail } = await import('@/lib/support');
    expect(supportEmail()).toBeNull();
  });

  it('returns null when SUPPORT_EMAIL is blank whitespace', async () => {
    process.env.SUPPORT_EMAIL = '   ';
    const { supportEmail } = await import('@/lib/support');
    expect(supportEmail()).toBeNull();
  });

  it('returns the trimmed address when set', async () => {
    process.env.SUPPORT_EMAIL = '  hello@example.org  ';
    const { supportEmail } = await import('@/lib/support');
    expect(supportEmail()).toBe('hello@example.org');
  });

  it('never falls back to a personal address', async () => {
    const { supportEmail } = await import('@/lib/support');
    expect(supportEmail()).not.toMatch(/gmail\.com/i);
  });
});

describe('fbGroupUrl', () => {
  it('returns null when unset — no guessed group URL', async () => {
    const { fbGroupUrl } = await import('@/lib/support');
    expect(fbGroupUrl()).toBeNull();
  });

  it('returns the URL when set', async () => {
    process.env.NEXT_PUBLIC_FB_GROUP_URL = 'https://www.facebook.com/groups/real-group';
    const { fbGroupUrl } = await import('@/lib/support');
    expect(fbGroupUrl()).toBe('https://www.facebook.com/groups/real-group');
  });
});

describe('outboundUserAgent', () => {
  it('omits the contact when SUPPORT_EMAIL is unset', async () => {
    const { outboundUserAgent } = await import('@/lib/support');
    const ua = outboundUserAgent('membership verification');
    expect(ua).toBe('WildNutritionPractitionerPortal/1.0 (membership verification)');
    expect(ua).not.toContain('@');
  });

  it('includes the contact when SUPPORT_EMAIL is set', async () => {
    process.env.SUPPORT_EMAIL = 'hello@example.org';
    const { outboundUserAgent } = await import('@/lib/support');
    expect(outboundUserAgent('membership verification')).toBe(
      'WildNutritionPractitionerPortal/1.0 (+hello@example.org; membership verification)'
    );
  });

  it('works with no purpose given', async () => {
    process.env.SUPPORT_EMAIL = 'hello@example.org';
    const { outboundUserAgent } = await import('@/lib/support');
    expect(outboundUserAgent()).toBe('WildNutritionPractitionerPortal/1.0 (+hello@example.org)');
  });
});
