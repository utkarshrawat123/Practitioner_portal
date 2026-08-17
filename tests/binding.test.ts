import { describe, it, expect } from 'vitest';
import { getD1Binding, getR2Binding } from '@/lib/db/binding';

describe('cloudflare binding accessors', () => {
  it('getD1Binding returns null off-Workers (dev/test)', () => {
    expect(getD1Binding()).toBeNull();
  });

  it('getR2Binding returns null off-Workers (dev/test)', () => {
    expect(getR2Binding()).toBeNull();
  });
});
