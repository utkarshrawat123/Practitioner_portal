import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-dashapi-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  delete process.env.PORTAL_URL;
  (await import('@/lib/stats')).clearStatsCacheForTests();
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function seedApproved() {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name: 'Jane Smith', email: 'jane@example.com', registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus: 'qualified',
  });
  return markApproved(p.id, {
    affiliateCode: 'WN-SMITH-AB2C', affiliateLink: 'http://localhost:3100/r/WN-SMITH-AB2C',
    pendingSync: false, decidedBy: 'system',
  });
}

async function sessionHeaders(id: number): Promise<Record<string, string>> {
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return { cookie: sessionCookieHeader(id).split(';')[0] };
}

describe('GET /r/[code]', () => {
  it('records the click and redirects to the Shopify discount URL', async () => {
    const p = await seedApproved();
    const { GET } = await import('@/app/r/[code]/route');
    const res = await GET(new Request('http://x/r/WN-SMITH-AB2C'), { params: { code: 'WN-SMITH-AB2C' } });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/discount/WN-SMITH-AB2C');
    const { clickStats } = await import('@/lib/db');
    expect((await clickStats(p.id)).clicksAllTime).toBe(1);
  });

  it('redirects unknown codes to the homepage', async () => {
    const { GET } = await import('@/app/r/[code]/route');
    const res = await GET(new Request('http://x/r/WN-NOPE-XXXX'), { params: { code: 'WN-NOPE-XXXX' } });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://www.wildnutrition.com/');
  });
});

describe('auth endpoints', () => {
  it('request-link always 200s; devLink only for approved practitioners', async () => {
    await seedApproved();
    const { POST } = await import('@/app/api/auth/request-link/route');
    const known = await POST(new Request('http://x/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jane@example.com' }),
    }));
    expect(known.status).toBe(200);
    expect((await known.json()).devLink).toContain('/api/auth/verify?token=');
    const unknown = await POST(new Request('http://x/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com' }),
    }));
    expect(unknown.status).toBe(200);
    expect((await unknown.json()).devLink).toBeNull();
  });

  it('verify sets a session cookie and redirects to /dashboard', async () => {
    const p = await seedApproved();
    const { createAuthToken } = await import('@/lib/db');
    const token = await createAuthToken(p.id);
    const { GET } = await import('@/app/api/auth/verify/route');
    const res = await GET(new Request(`http://x/api/auth/verify?token=${token}`));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost:3100/dashboard');
    expect(res.headers.get('set-cookie')).toContain('wn_session=');
    const bad = await GET(new Request('http://x/api/auth/verify?token=nope'));
    expect(bad.headers.get('location')).toBe('http://localhost:3100/dashboard?error=expired');
  });
});

describe('/api/me and /api/me/stats', () => {
  it('401 without a session', async () => {
    const me = await import('@/app/api/me/route');
    expect((await me.GET(new Request('http://x/'))).status).toBe(401);
    const stats = await import('@/app/api/me/stats/route');
    expect((await stats.GET(new Request('http://x/'))).status).toBe(401);
  });

  it('returns profile, code, portal link and stats with a session', async () => {
    const p = await seedApproved();
    const headers = await sessionHeaders(p.id);
    const me = await import('@/app/api/me/route');
    const meRes = await me.GET(new Request('http://x/', { headers }));
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.practitioner.name).toBe('Jane Smith');
    expect(meBody.practitioner.tier).toBe('standard');
    expect(meBody.code).toBe('WN-SMITH-AB2C');
    expect(meBody.link).toBe('http://localhost:3100/r/WN-SMITH-AB2C');
    const stats = await import('@/app/api/me/stats/route');
    const sRes = await stats.GET(new Request('http://x/', { headers }));
    expect(sRes.status).toBe(200);
    const s = await sRes.json();
    expect(s.clicksAllTime).toBe(0);
    expect(s.stale).toBe(false);
  });
});
