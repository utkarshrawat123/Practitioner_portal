import { describe, it, expect } from 'vitest';
import { createSessionValue, verifySessionValue } from '@/lib/practitionerAuth';

describe('session value round trip', () => {
  it('verifies a freshly signed value', () => {
    const value = createSessionValue(42);
    expect(verifySessionValue(value)).toBe(42);
  });
  it('rejects a tampered value', () => {
    const value = createSessionValue(42);
    const tampered = value.replace(/^42\./, '43.');
    expect(verifySessionValue(tampered)).toBeNull();
  });
  it('rejects an expired value', () => {
    const value = createSessionValue(42, Date.now() - 1000);
    expect(verifySessionValue(value)).toBeNull();
  });
});
