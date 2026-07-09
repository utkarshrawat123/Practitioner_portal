import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-rep-api-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'secret-pass';
  delete process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_ADMIN_TOKEN;
  (await import('@/lib/reporting/report')).clearReportCacheForTests();
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved() {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name: 'Jane Smith', email: 'jane@example.com', registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus: 'qualified',
  });
  return markApproved(p.id, {
    affiliateCode: 'WN-SMITH-AB2C', affiliateLink: 'http://x/r/WN-SMITH-AB2C',
    pendingSync: false, decidedBy: 'system',
  });
}

async function adminHeaders(): Promise<Record<string, string>> {
  const { adminToken } = await import('@/lib/adminAuth');
  return { cookie: `wn_admin=${adminToken()}` };
}

describe('GET /api/admin/reporting', () => {
  it('is admin-gated and returns rows + summary', async () => {
    await seedApproved();
    const { GET } = await import('@/app/api/admin/reporting/route');
    expect((await GET(new Request('http://x/api/admin/reporting'))).status).toBe(401);
    const res = await GET(new Request('http://x/api/admin/reporting', { headers: await adminHeaders() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].name).toBe('Jane Smith');
    expect(body.summary.total).toBe(1);
  });
});

describe('GET /api/admin/reporting/export', () => {
  it('is admin-gated and returns a CSV attachment', async () => {
    await seedApproved();
    const { GET } = await import('@/app/api/admin/reporting/export/route');
    expect((await GET(new Request('http://x/'))).status).toBe(401);
    const res = await GET(new Request('http://x/', { headers: await adminHeaders() }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const text = await res.text();
    expect(text).toContain('name,email');
    expect(text).toContain('Jane Smith');
  });
});
