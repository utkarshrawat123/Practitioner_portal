import { describe, it, expect } from 'vitest';
import { generateCode, referralLink, shopifyDiscountUrl } from '@/lib/codes';

describe('generateCode', () => {
  it('formats as WN-SURNAME-XXXX', async () => {
    const code = await generateCode('Jane Smith', () => false);
    expect(code).toMatch(/^WN-SMITH-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{4}$/);
  });

  it('truncates long surnames to 6 chars and strips non-letters', async () => {
    const code = await generateCode("Ana O'Sullivan-Brown", () => false);
    expect(code).toMatch(/^WN-[A-Z]{1,6}-[A-Z2-9]{4}$/);
    expect(code.split('-')[1].length).toBeLessThanOrEqual(6);
  });

  it('uses fallback when name has no usable surname', async () => {
    const code = await generateCode('  超 ', () => false);
    expect(code).toMatch(/^WN-PRACT-[A-Z2-9]{4}$/);
  });

  it('retries on collision', async () => {
    let calls = 0;
    const code = await generateCode('Jane Smith', () => ++calls <= 2);
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(code).toMatch(/^WN-SMITH-/);
  });

  it('throws after exhausting attempts', async () => {
    await expect(generateCode('Jane Smith', () => true)).rejects.toThrow(/unique/i);
  });
});

describe('referralLink', () => {
  it('builds a portal redirect URL from PORTAL_URL', () => {
    process.env.PORTAL_URL = 'https://portal.example.com';
    expect(referralLink('WN-SMITH-AB2C')).toBe('https://portal.example.com/r/WN-SMITH-AB2C');
    delete process.env.PORTAL_URL;
    expect(referralLink('WN-SMITH-AB2C')).toBe('http://localhost:3100/r/WN-SMITH-AB2C');
  });

  it('builds the Shopify discount destination with UTM params', () => {
    expect(shopifyDiscountUrl('WN-SMITH-AB2C')).toBe(
      'https://www.wildnutrition.com/discount/WN-SMITH-AB2C?utm_source=practitioner&utm_medium=referral&utm_campaign=WN-SMITH-AB2C'
    );
  });
});
