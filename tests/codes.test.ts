import { describe, it, expect } from 'vitest';
import { generateCode, referralLink } from '@/lib/codes';

describe('generateCode', () => {
  it('formats as WN-SURNAME-XXXX', () => {
    const code = generateCode('Jane Smith', () => false);
    expect(code).toMatch(/^WN-SMITH-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{4}$/);
  });

  it('truncates long surnames to 6 chars and strips non-letters', () => {
    const code = generateCode("Ana O'Sullivan-Brown", () => false);
    expect(code).toMatch(/^WN-[A-Z]{1,6}-[A-Z2-9]{4}$/);
    expect(code.split('-')[1].length).toBeLessThanOrEqual(6);
  });

  it('uses fallback when name has no usable surname', () => {
    const code = generateCode('  超 ', () => false);
    expect(code).toMatch(/^WN-PRACT-[A-Z2-9]{4}$/);
  });

  it('retries on collision', () => {
    let calls = 0;
    const code = generateCode('Jane Smith', () => ++calls <= 2);
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(code).toMatch(/^WN-SMITH-/);
  });

  it('throws after exhausting attempts', () => {
    expect(() => generateCode('Jane Smith', () => true)).toThrow(/unique/i);
  });
});

describe('referralLink', () => {
  it('builds discount URL with UTM params', () => {
    expect(referralLink('WN-SMITH-AB2C')).toBe(
      'https://www.wildnutrition.com/discount/WN-SMITH-AB2C?utm_source=practitioner&utm_medium=referral&utm_campaign=WN-SMITH-AB2C'
    );
  });
});
