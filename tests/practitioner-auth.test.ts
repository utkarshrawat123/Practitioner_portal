import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  createSessionValue, verifySessionValue, sessionCookieHeader, getSessionPractitioner,
} from '@/lib/practitionerAuth';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-auth-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seed(status: 'approved' | 'flagged') {
  const { insertApplication, markApproved, flagPractitioner } = await import('@/lib/db');
  const p = insertApplication({
    name: 'Jane Smith', email: 'jane@example.com', registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus: 'qualified',
  });
  if (status === 'approved') {
    return markApproved(p.id, {
      affiliateCode: 'WN-SMITH-AB2C', affiliateLink: 'http://localhost:3100/r/WN-SMITH-AB2C',
      pendingSync: false, decidedBy: 'system',
    });
  }
  return flagPractitioner(p.id, {
    reasonCode: 'NO_MATCH', confidence: 'none', detail: 'x', manualSearchUrl: 'https://example.com',
  });
}

describe('session values', () => {
  it('round-trips a valid session', () => {
    const v = createSessionValue(42);
    expect(verifySessionValue(v)).toBe(42);
  });

  it('rejects tampered ids and signatures', () => {
    const v = createSessionValue(42);
    const [, exp, mac] = v.split('.');
    expect(verifySessionValue(`43.${exp}.${mac}`)).toBeNull();
    expect(verifySessionValue(`42.${exp}.${'0'.repeat(64)}`)).toBeNull();
    expect(verifySessionValue('garbage')).toBeNull();
  });

  it('rejects expired sessions', () => {
    const v = createSessionValue(42, Date.now() - 1000);
    expect(verifySessionValue(v)).toBeNull();
  });
});

describe('getSessionPractitioner', () => {
  it('resolves the practitioner from the cookie', async () => {
    const p = await seed('approved');
    const req = new Request('http://x/', {
      headers: { cookie: sessionCookieHeader(p.id).split(';')[0] },
    });
    expect(getSessionPractitioner(req)?.email).toBe('jane@example.com');
    expect(getSessionPractitioner(new Request('http://x/'))).toBeNull();
  });
});

describe('requestLoginLink', () => {
  it('returns a consumable devLink for approved practitioners (mock sender)', async () => {
    const p = await seed('approved');
    const { requestLoginLink } = await import('@/lib/magicLink');
    const { devLink } = await requestLoginLink('jane@example.com');
    expect(devLink).toContain('/api/auth/verify?token=');
    const token = devLink!.split('token=')[1];
    const { consumeAuthToken } = await import('@/lib/db');
    expect(consumeAuthToken(token)).toBe(p.id);
  });

  it('returns null devLink for unknown or non-approved emails', async () => {
    await seed('flagged');
    const { requestLoginLink } = await import('@/lib/magicLink');
    expect((await requestLoginLink('jane@example.com')).devLink).toBeNull();
    expect((await requestLoginLink('nobody@example.com')).devLink).toBeNull();
  });
});
