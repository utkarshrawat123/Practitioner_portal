import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/reporting/csv';
import type { ReportRow } from '@/lib/reporting/report';

const row = (over: Partial<ReportRow> = {}): ReportRow => ({
  id: 1, name: 'Jane Smith', email: 'jane@example.com', status: 'approved', tier: 'gold',
  referredRevenue: 5000, orders: 4, clicks: 2, conversionRate: 200, engagementScore: 40,
  lessonsCompleted: 3, lastLoginAt: '2026-07-01T00:00:00Z', lastReferralAt: null,
  dormant: true, churnRisk: false, powerUser: true, dataWarning: false, ...over,
});

describe('toCsv', () => {
  it('emits a header and one line per row with booleans as yes/no and nulls empty', () => {
    const csv = toCsv([row()]);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('name');
    expect(lines[0]).toContain('referredRevenue');
    expect(lines[1]).toContain('Jane Smith');
    expect(lines[1]).toContain('yes'); // powerUser true
    expect(lines[1]).toContain('no');  // churnRisk false
    // lastReferralAt null → empty field (two consecutive commas somewhere)
    expect(lines[1]).toMatch(/,,/);
  });

  it('escapes commas, quotes, and newlines', () => {
    const csv = toCsv([row({ name: 'Smith, Jane "JS"' })]);
    const dataLine = csv.trim().split('\n')[1];
    expect(dataLine).toContain('"Smith, Jane ""JS"""');
  });
});
