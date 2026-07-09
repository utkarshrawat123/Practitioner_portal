import type { ReportRow } from '@/lib/reporting/report';

const COLUMNS: (keyof ReportRow)[] = [
  'id', 'name', 'email', 'status', 'tier',
  'referredRevenue', 'orders', 'clicks', 'conversionRate',
  'engagementScore', 'lessonsCompleted', 'lastLoginAt', 'lastReferralAt',
  'dormant', 'churnRisk', 'powerUser', 'dataWarning',
];

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** RFC-4180 CSV of report rows. */
export function toCsv(rows: ReportRow[]): string {
  const header = COLUMNS.join(',');
  const body = rows.map((row) => COLUMNS.map((col) => cell(row[col])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}
