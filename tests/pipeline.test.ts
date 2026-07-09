import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-pipe-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  delete process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_ADMIN_TOKEN;
  delete process.env.MAILCHIMP_API_KEY;
  delete process.env.MAILCHIMP_AUDIENCE_ID;
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

const app = {
  name: 'Jane Smith',
  email: 'jane@example.com',
  registerBody: 'BANT',
  registerNumber: '12345',
  qualificationStatus: 'qualified' as const,
};

function stubDirectory(html: string, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status })));
}

describe('processApplication', () => {
  it('auto-approves a qualified high-confidence match with code, link and events', async () => {
    stubDirectory('<div>Jane Smith — Registered Nutritional Therapist</div>');
    const { processApplication } = await import('@/lib/pipeline');
    const p = await processApplication(app);
    expect(p.status).toBe('approved');
    expect(p.verification?.reasonCode).toBe('AUTO_MATCH');
    expect(p.affiliateCode).toMatch(/^WN-SMITH-/);
    expect(p.affiliateLink).toContain(p.affiliateCode!);
    expect(p.pendingSync).toBe(false);
    expect(p.decidedBy).toBe('system');
    const { listEvents } = await import('@/lib/db');
    expect((await listEvents(p.id)).length).toBeGreaterThanOrEqual(2);
  });

  it('flags a no-match with manual search url', async () => {
    stubDirectory('<div>No results found</div>');
    const { processApplication } = await import('@/lib/pipeline');
    const p = await processApplication(app);
    expect(p.status).toBe('flagged');
    expect(p.verification?.reasonCode).toBe('NO_MATCH');
    expect(p.verification?.manualSearchUrl).toMatch(/^https:\/\//);
    expect(p.affiliateCode).toBeNull();
  });

  it('flags students without touching the directory', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { processApplication } = await import('@/lib/pipeline');
    const p = await processApplication({ ...app, qualificationStatus: 'student' });
    expect(p.status).toBe('flagged');
    expect(p.verification?.reasonCode).toBe('STUDENT_MANUAL');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('flags directory outages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const { processApplication } = await import('@/lib/pipeline');
    const p = await processApplication(app);
    expect(p.status).toBe('flagged');
    expect(p.verification?.reasonCode).toBe('DIRECTORY_UNAVAILABLE');
  });

  it('rejects duplicate email with DuplicateEmailError', async () => {
    stubDirectory('<div>Jane Smith</div>');
    const { processApplication, DuplicateEmailError } = await import('@/lib/pipeline');
    await processApplication(app);
    await expect(processApplication({ ...app, registerNumber: '999' }))
      .rejects.toBeInstanceOf(DuplicateEmailError);
  });

  it('flags same register number under a different email as DUPLICATE', async () => {
    stubDirectory('<div>Jane Smith</div>');
    const { processApplication } = await import('@/lib/pipeline');
    await processApplication(app);
    stubDirectory('<div>John Smith</div>');
    const p2 = await processApplication({ ...app, name: 'John Smith', email: 'john@example.com' });
    expect(p2.status).toBe('flagged');
    expect(p2.verification?.reasonCode).toBe('DUPLICATE');
  });
});

describe('approvePractitioner', () => {
  it('approves a flagged record and is idempotent', async () => {
    stubDirectory('<div>nothing</div>');
    const { processApplication, approvePractitioner } = await import('@/lib/pipeline');
    const flagged = await processApplication(app);
    const approved = await approvePractitioner(flagged.id, 'admin');
    expect(approved.status).toBe('approved');
    expect(approved.decidedBy).toBe('admin');
    const again = await approvePractitioner(flagged.id, 'admin');
    expect(again.affiliateCode).toBe(approved.affiliateCode);
  });
});
