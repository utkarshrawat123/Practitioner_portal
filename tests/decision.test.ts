import { describe, it, expect } from 'vitest';
import { decide } from '@/lib/decision';

describe('decide', () => {
  it('auto-approves qualified high-confidence matches', () => {
    expect(decide({ qualificationStatus: 'qualified', confidence: 'high', isDuplicate: false }))
      .toEqual({ status: 'approved', reasonCode: 'AUTO_MATCH' });
  });

  it('flags partial matches', () => {
    expect(decide({ qualificationStatus: 'qualified', confidence: 'partial', isDuplicate: false }))
      .toEqual({ status: 'flagged', reasonCode: 'PARTIAL_MATCH' });
  });

  it('flags no-match', () => {
    expect(decide({ qualificationStatus: 'qualified', confidence: 'none', isDuplicate: false }))
      .toEqual({ status: 'flagged', reasonCode: 'NO_MATCH' });
  });

  it('flags when the directory is unavailable', () => {
    expect(decide({ qualificationStatus: 'qualified', confidence: 'unavailable', isDuplicate: false }))
      .toEqual({ status: 'flagged', reasonCode: 'DIRECTORY_UNAVAILABLE' });
  });

  it('always flags students, even with a high match', () => {
    expect(decide({ qualificationStatus: 'student', confidence: 'high', isDuplicate: false }))
      .toEqual({ status: 'flagged', reasonCode: 'STUDENT_MANUAL' });
    expect(decide({ qualificationStatus: 'student', confidence: null, isDuplicate: false }))
      .toEqual({ status: 'flagged', reasonCode: 'STUDENT_MANUAL' });
  });

  it('duplicate wins over everything', () => {
    expect(decide({ qualificationStatus: 'qualified', confidence: 'high', isDuplicate: true }))
      .toEqual({ status: 'flagged', reasonCode: 'DUPLICATE' });
    expect(decide({ qualificationStatus: 'student', confidence: null, isDuplicate: true }))
      .toEqual({ status: 'flagged', reasonCode: 'DUPLICATE' });
  });
});
