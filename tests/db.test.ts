import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-db-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});

afterEach(async () => {
  const db = await import('@/lib/db');
  db.resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

const sample = {
  name: 'Jane Smith',
  email: 'jane@example.com',
  registerBody: 'BANT',
  registerNumber: '12345',
  qualificationStatus: 'qualified' as const,
};

describe('db', () => {
  it('inserts and reads an application with defaults', async () => {
    const { insertApplication, getPractitioner } = await import('@/lib/db');
    const p = insertApplication(sample);
    expect(p.id).toBeGreaterThan(0);
    expect(p.status).toBe('pending');
    expect(p.tier).toBe('standard');
    expect(p.pendingSync).toBe(false);
    expect(getPractitioner(p.id)?.email).toBe('jane@example.com');
  });

  it('finds by email and detects duplicate registrations', async () => {
    const { insertApplication, findByEmail, hasDuplicateRegistration } =
      await import('@/lib/db');
    const p = insertApplication(sample);
    expect(findByEmail('jane@example.com')?.id).toBe(p.id);
    expect(findByEmail('nobody@example.com')).toBeNull();
    expect(hasDuplicateRegistration('BANT', '12345', 999)).toBe(true);
    expect(hasDuplicateRegistration('BANT', '12345', p.id)).toBe(false);
    expect(hasDuplicateRegistration('CNHC', '12345', 999)).toBe(false);
  });

  it('flags with verification json round-trip', async () => {
    const { insertApplication, flagPractitioner } = await import('@/lib/db');
    const p = insertApplication(sample);
    const v = {
      reasonCode: 'NO_MATCH',
      confidence: 'none',
      detail: 'not found',
      manualSearchUrl: 'https://example.com',
    };
    const flagged = flagPractitioner(p.id, v);
    expect(flagged.status).toBe('flagged');
    expect(flagged.verification).toEqual(v);
    expect(flagged.decidedBy).toBe('system');
  });

  it('marks approved with code and pending sync', async () => {
    const { insertApplication, markApproved, isCodeTaken } = await import('@/lib/db');
    const p = insertApplication(sample);
    const a = markApproved(p.id, {
      affiliateCode: 'WN-SMITH-AB2C',
      affiliateLink: 'https://example.com/x',
      pendingSync: true,
      decidedBy: 'system',
    });
    expect(a.status).toBe('approved');
    expect(a.pendingSync).toBe(true);
    expect(isCodeTaken('WN-SMITH-AB2C')).toBe(true);
    expect(isCodeTaken('WN-OTHER-XX22')).toBe(false);
  });

  it('rejects, lists by status, and records events', async () => {
    const { insertApplication, markRejected, listPractitioners, addEvent, listEvents } =
      await import('@/lib/db');
    const p1 = insertApplication(sample);
    insertApplication({ ...sample, email: 'b@example.com', registerNumber: '99' });
    markRejected(p1.id, 'admin');
    expect(listPractitioners('rejected').map((x) => x.id)).toEqual([p1.id]);
    expect(listPractitioners()).toHaveLength(2);
    addEvent(p1.id, 'decision', 'rejected by admin');
    expect(listEvents(p1.id)[0].detail).toBe('rejected by admin');
  });
});
