import { describe, it, expect } from 'vitest';
import { formatMoney } from '@/lib/format';

// Patient carts carry a `currency` column (default GBP), but the UI hardcoded
// "£" — a EUR or USD cart would have displayed the wrong symbol at the exact
// moment a patient is asked to pay.
describe('formatMoney', () => {
  it('formats GBP with the pound symbol', () => {
    expect(formatMoney(72.45, 'GBP')).toBe('£72.45');
  });

  it('formats other ISO currencies with their symbol', () => {
    expect(formatMoney(10, 'EUR')).toBe('€10.00');
    expect(formatMoney(10, 'USD')).toBe('US$10.00');
  });

  it('always shows two decimal places', () => {
    expect(formatMoney(20.5, 'GBP')).toBe('£20.50');
    expect(formatMoney(41, 'GBP')).toBe('£41.00');
  });

  it('falls back to GBP for a missing or malformed currency code', () => {
    expect(formatMoney(5, undefined)).toBe('£5.00');
    expect(formatMoney(5, 'not-a-code')).toBe('£5.00');
  });
});
