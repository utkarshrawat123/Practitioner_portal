import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-api-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

function post(body: unknown) {
  return new Request('http://localhost/api/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const valid = {
  name: 'Jane Smith',
  email: 'jane@example.com',
  registerBody: 'BANT',
  registerNumber: '12345',
  qualificationStatus: 'qualified',
};

describe('POST /api/apply', () => {
  it('returns approved with code and link on a clear match', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<div>Jane Smith</div>', { status: 200 })));
    const { POST } = await import('@/app/api/apply/route');
    const res = await POST(post(valid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('approved');
    expect(body.code).toMatch(/^WN-SMITH-/);
    expect(body.link).toContain(body.code);
  });

  it('logs the newly approved practitioner in via a session cookie', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<div>Jane Smith</div>', { status: 200 })));
    const { POST } = await import('@/app/api/apply/route');
    const res = await POST(post(valid));
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/wn_session=/);
    expect(setCookie).toMatch(/HttpOnly/);
    // The cookie must resolve to the approved practitioner that just applied.
    const value = setCookie!.match(/wn_session=([^;]+)/)![1];
    const { verifySessionValue } = await import('@/lib/practitionerAuth');
    const { getPractitioner } = await import('@/lib/db');
    const id = verifySessionValue(value);
    expect(id).not.toBeNull();
    const p = await getPractitioner(id!);
    expect(p!.email).toBe('jane@example.com');
    expect(p!.status).toBe('approved');
  });

  it('returns flagged without exposing internal reasons', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<div>no match here</div>', { status: 200 })));
    const { POST } = await import('@/app/api/apply/route');
    const res = await POST(post(valid));
    const body = await res.json();
    expect(body.status).toBe('flagged');
    expect(body.reasonCode).toBeUndefined();
    expect(body.code).toBeUndefined();
    // Flagged applicants are not approved, so no session is issued.
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('400s on invalid payload with field errors', async () => {
    const { POST } = await import('@/app/api/apply/route');
    const res = await POST(post({ ...valid, email: 'not-an-email', registerBody: 'GMC' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('409s on duplicate email', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<div>Jane Smith</div>', { status: 200 })));
    const { POST } = await import('@/app/api/apply/route');
    await POST(post(valid));
    const res = await POST(post({ ...valid, registerNumber: '777' }));
    expect(res.status).toBe(409);
  });
});
