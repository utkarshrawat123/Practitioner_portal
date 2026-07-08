import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-admin-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'secret-pass';
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function authedHeaders(): Promise<Record<string, string>> {
  const { adminToken } = await import('@/lib/adminAuth');
  return { Cookie: `wn_admin=${adminToken()}` };
}

async function seedFlagged() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<p>no match</p>', { status: 200 })));
  const { processApplication } = await import('@/lib/pipeline');
  const p = await processApplication({
    name: 'Jane Smith', email: 'jane@example.com', registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus: 'qualified',
  });
  vi.unstubAllGlobals();
  return p;
}

describe('admin auth', () => {
  it('login sets cookie for correct password, 401 otherwise', async () => {
    const { POST } = await import('@/app/api/admin/login/route');
    const bad = await POST(new Request('http://x/api/admin/login', {
      method: 'POST', body: JSON.stringify({ password: 'wrong' }),
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(bad.status).toBe(401);
    const good = await POST(new Request('http://x/api/admin/login', {
      method: 'POST', body: JSON.stringify({ password: 'secret-pass' }),
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(good.status).toBe(204);
    expect(good.headers.get('set-cookie')).toContain('wn_admin=');
  });

  it('list endpoint requires auth', async () => {
    const { GET } = await import('@/app/api/admin/practitioners/route');
    const res = await GET(new Request('http://x/api/admin/practitioners'));
    expect(res.status).toBe(401);
  });
});

describe('admin actions', () => {
  it('lists practitioners filtered by status', async () => {
    const p = await seedFlagged();
    const { GET } = await import('@/app/api/admin/practitioners/route');
    const res = await GET(new Request('http://x/api/admin/practitioners?status=flagged', {
      headers: await authedHeaders(),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.practitioners.map((x: any) => x.id)).toEqual([p.id]);
  });

  it('approves a flagged practitioner via action endpoint', async () => {
    const p = await seedFlagged();
    const { POST } = await import('@/app/api/admin/practitioners/[id]/route');
    const res = await POST(
      new Request(`http://x/api/admin/practitioners/${p.id}`, {
        method: 'POST',
        headers: { ...(await authedHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      }),
      { params: { id: String(p.id) } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.practitioner.status).toBe('approved');
    expect(body.practitioner.affiliateCode).toMatch(/^WN-/);
    expect(body.events.length).toBeGreaterThan(0);
  });

  it('404s on unknown id and 400s on unknown action', async () => {
    const { POST } = await import('@/app/api/admin/practitioners/[id]/route');
    const headers = { ...(await authedHeaders()), 'Content-Type': 'application/json' };
    const missing = await POST(
      new Request('http://x/api/admin/practitioners/999', {
        method: 'POST', headers, body: JSON.stringify({ action: 'approve' }),
      }),
      { params: { id: '999' } }
    );
    expect(missing.status).toBe(404);
    const p = await seedFlagged();
    const badAction = await POST(
      new Request(`http://x/api/admin/practitioners/${p.id}`, {
        method: 'POST', headers, body: JSON.stringify({ action: 'explode' }),
      }),
      { params: { id: String(p.id) } }
    );
    expect(badAction.status).toBe(400);
  });
});
