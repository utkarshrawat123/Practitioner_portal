import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
let saved: string | undefined;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-apply-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  saved = process.env.SUPPORT_EMAIL;
  delete process.env.SUPPORT_EMAIL;
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  if (saved === undefined) delete process.env.SUPPORT_EMAIL;
  else process.env.SUPPORT_EMAIL = saved;
});

function applyRequest(email: string): Request {
  return new Request('http://x/api/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Dupe Tester',
      email,
      registerBody: 'BANT',
      registerNumber: '12345',
      qualificationStatus: 'qualified',
    }),
  });
}

describe('duplicate application copy', () => {
  it('does not name a personal address when SUPPORT_EMAIL is unset', async () => {
    const { POST } = await import('@/app/api/apply/route');
    await POST(applyRequest('dupe@example.com'));
    const res = await POST(applyRequest('dupe@example.com'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).not.toMatch(/gmail\.com/i);
    expect(body.error).toContain('An application already exists');
  });

  it('names the configured address when set', async () => {
    process.env.SUPPORT_EMAIL = 'practitioners@example.org';
    const { POST } = await import('@/app/api/apply/route');
    await POST(applyRequest('dupe2@example.com'));
    const res = await POST(applyRequest('dupe2@example.com'));
    const body = await res.json();
    expect(body.error).toContain('practitioners@example.org');
  });
});
