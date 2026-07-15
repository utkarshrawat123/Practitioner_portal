import { describe, it, expect } from 'vitest';
import { hasAccess } from '@/lib/access';

const qualified = { qualificationStatus: 'qualified' as const };
const student = { qualificationStatus: 'student' as const };

describe('hasAccess', () => {
  it("'all' content is visible to everyone, including logged-out", () => {
    expect(hasAccess(qualified, { audience: 'all' })).toBe(true);
    expect(hasAccess(student, { audience: 'all' })).toBe(true);
    expect(hasAccess(null, { audience: 'all' })).toBe(true);
    expect(hasAccess(student, {})).toBe(true); // missing audience defaults to 'all'
  });

  it("'qualified' content is HCP-only", () => {
    expect(hasAccess(qualified, { audience: 'qualified' })).toBe(true);
    expect(hasAccess(student, { audience: 'qualified' })).toBe(false);
    expect(hasAccess(null, { audience: 'qualified' })).toBe(false);
  });

  it("'student' content is student-only (exact match, not a hierarchy)", () => {
    expect(hasAccess(student, { audience: 'student' })).toBe(true);
    expect(hasAccess(qualified, { audience: 'student' })).toBe(false);
  });
});
