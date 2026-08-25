import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const KEYS = ['SUPPORT_EMAIL', 'NEXT_PUBLIC_FB_GROUP_URL', 'PORTAL_URL', 'CLOUDFLARE_D1_ID'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const bindings = { hasD1: true, hasR2: true };

describe('readiness — support address', () => {
  it('reports support_email as missing and required when unset', async () => {
    const { readinessReport } = await import('@/lib/readiness');
    const check = readinessReport(bindings).checks.find((c) => c.key === 'support_email');
    expect(check).toBeDefined();
    expect(check!.status).toBe('missing');
    expect(check!.required).toBe(true);
  });

  it('blocks ready when the support address is unset', async () => {
    const { readinessReport } = await import('@/lib/readiness');
    expect(readinessReport(bindings).missingRequired).toContain('support_email');
  });

  it('goes live once set', async () => {
    process.env.SUPPORT_EMAIL = 'practitioners@example.org';
    const { readinessReport } = await import('@/lib/readiness');
    const check = readinessReport(bindings).checks.find((c) => c.key === 'support_email');
    expect(check!.status).toBe('live');
  });

  it('never leaks the configured address into the report', async () => {
    process.env.SUPPORT_EMAIL = 'practitioners@example.org';
    const { readinessReport } = await import('@/lib/readiness');
    expect(JSON.stringify(readinessReport(bindings))).not.toContain('practitioners@example.org');
  });
});

describe('readiness — localhost PORTAL_URL', () => {
  it('warns when PORTAL_URL still points at localhost', async () => {
    process.env.PORTAL_URL = 'http://localhost:3100';
    const { readinessReport } = await import('@/lib/readiness');
    const report = readinessReport(bindings);
    expect(report.warnings.some((w) => w.includes('localhost'))).toBe(true);
    expect(report.checks.find((c) => c.key === 'portal_url')!.status).not.toBe('live');
  });

  it('is clean for a real URL', async () => {
    process.env.PORTAL_URL = 'https://portal.example.org';
    const { readinessReport } = await import('@/lib/readiness');
    const report = readinessReport(bindings);
    expect(report.warnings.some((w) => w.includes('localhost'))).toBe(false);
    expect(report.checks.find((c) => c.key === 'portal_url')!.status).toBe('live');
  });
});

describe('readiness — facebook group', () => {
  it('reports fb_group as missing but NOT required', async () => {
    const { readinessReport } = await import('@/lib/readiness');
    const check = readinessReport(bindings).checks.find((c) => c.key === 'fb_group');
    expect(check!.status).toBe('missing');
    expect(check!.required).toBe(false);
  });
});

describe('readiness — D1 placeholder id', () => {
  it('reports d1_id as missing and required until the real id is recorded', async () => {
    const { readinessReport } = await import('@/lib/readiness');
    const check = readinessReport(bindings).checks.find((c) => c.key === 'd1_id');
    expect(check!.status).toBe('missing');
    expect(check!.required).toBe(true);
  });
});
