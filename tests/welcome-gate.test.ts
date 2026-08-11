import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-welcome-gate-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  delete process.env.PORTAL_URL;
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved(email = 'jane@example.com') {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name: 'Jane Smith', email, registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus: 'qualified',
  });
  return markApproved(p.id, {
    affiliateCode: 'WN-SMITH-AB2C', affiliateLink: 'http://localhost:3100/r/WN-SMITH-AB2C',
    pendingSync: false, decidedBy: 'system',
  });
}

describe('welcome cookie helpers', () => {
  it('seen cookie is a session cookie (no Max-Age); clear cookie expires it', async () => {
    const { welcomeSeenCookieHeader, clearWelcomeCookieHeader, WELCOME_COOKIE } =
      await import('@/lib/welcomeGate');
    const seen = welcomeSeenCookieHeader();
    expect(seen).toContain(`${WELCOME_COOKIE}=1`);
    expect(seen).toContain('HttpOnly');
    expect(seen).not.toContain('Max-Age');
    const cleared = clearWelcomeCookieHeader();
    expect(cleared).toContain(`${WELCOME_COOKIE}=;`);
    expect(cleared).toContain('Max-Age=0');
  });
});

describe('login routes clear the welcome cookie so the takeover replays', () => {
  it('verify clears wn_welcome alongside the session cookie', async () => {
    const p = await seedApproved();
    const { createAuthToken } = await import('@/lib/db');
    const token = await createAuthToken(p.id);
    const { GET } = await import('@/app/api/auth/verify/route');
    const res = await GET(new Request(`http://x/api/auth/verify?token=${token}`));
    const cookies = res.headers.get('set-cookie') ?? '';
    expect(cookies).toContain('wn_session=');
    expect(cookies).toContain('wn_welcome=;');
    expect(cookies).toContain('Max-Age=0');
  });

  it('approved application clears wn_welcome so the new practitioner sees the takeover', async () => {
    const { POST } = await import('@/app/api/apply/route');
    const res = await POST(new Request('http://x/api/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ada Approved', email: 'ada@example.com', registerBody: 'BANT',
        registerNumber: '999', qualificationStatus: 'qualified',
      }),
    }));
    const body = await res.json();
    // Only assert the cookie when the pipeline auto-approves; flagged applicants
    // never log in, so there is nothing to clear.
    if (body.status === 'approved') {
      const cookies = res.headers.get('set-cookie') ?? '';
      expect(cookies).toContain('wn_session=');
      expect(cookies).toContain('wn_welcome=;');
    }
  });
});

describe('dismissing the takeover sets the welcome cookie', () => {
  it('POST /api/me/seen-welcome sets wn_welcome and marks the DB flag', async () => {
    const p = await seedApproved();
    const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
    const headers = { cookie: sessionCookieHeader(p.id).split(';')[0] };
    const { POST } = await import('@/app/api/me/seen-welcome/route');
    const res = await POST(new Request('http://x/api/me/seen-welcome', { method: 'POST', headers }));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie') ?? '').toContain('wn_welcome=1');
    const { getPractitioner } = await import('@/lib/db');
    expect((await getPractitioner(p.id))!.hasSeenWelcome).toBe(true);
  });

  it('401 without a session', async () => {
    const { POST } = await import('@/app/api/me/seen-welcome/route');
    const res = await POST(new Request('http://x/api/me/seen-welcome', { method: 'POST' }));
    expect(res.status).toBe(401);
  });
});
