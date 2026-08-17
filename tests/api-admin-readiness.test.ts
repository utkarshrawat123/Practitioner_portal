import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';

const PASSWORD = 'preview-admin';
let savedAdmin: string | undefined;
let savedResend: string | undefined;

beforeEach(() => {
  savedAdmin = process.env.ADMIN_PASSWORD;
  savedResend = process.env.RESEND_API_KEY;
  process.env.ADMIN_PASSWORD = PASSWORD;
});
afterEach(() => {
  if (savedAdmin === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = savedAdmin;
  if (savedResend === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = savedResend;
});

function adminHeaders(): Record<string, string> {
  const token = createHash('sha256').update(PASSWORD).digest('hex');
  return { cookie: `wn_admin=${token}` };
}

describe('GET /api/admin/readiness', () => {
  it('401s without an admin cookie', async () => {
    const { GET } = await import('@/app/api/admin/readiness/route');
    const res = await GET(new Request('http://x/api/admin/readiness'));
    expect(res.status).toBe(401);
  });

  it('returns the readiness report for an authed admin', async () => {
    const { GET } = await import('@/app/api/admin/readiness/route');
    const res = await GET(new Request('http://x/api/admin/readiness', { headers: adminHeaders() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.ready).toBe('boolean');
    expect(Array.isArray(body.checks)).toBe(true);
    expect(body.checks.some((c: { key: string }) => c.key === 'database')).toBe(true);
  });

  it('never includes a secret value in the response', async () => {
    process.env.RESEND_API_KEY = 'resend-super-secret';
    const { GET } = await import('@/app/api/admin/readiness/route');
    const res = await GET(new Request('http://x/api/admin/readiness', { headers: adminHeaders() }));
    expect(await res.text()).not.toContain('resend-super-secret');
  });
});
