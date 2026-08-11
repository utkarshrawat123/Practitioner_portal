import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-cert-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.SESSION_SECRET = 'test-secret';
  delete process.env.GMAIL_USER; // force mock cert-request sender
  delete process.env.RESEND_API_KEY;
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('cert upload token', () => {
  it('round-trips a valid token and rejects tampering / expiry / cross-purpose', async () => {
    const { createCertUploadToken, verifyCertUploadToken } = await import('@/lib/certUpload');
    const token = createCertUploadToken(42);
    expect(verifyCertUploadToken(token)).toBe(42);
    expect(verifyCertUploadToken(token + 'x')).toBeNull();
    expect(verifyCertUploadToken('garbage')).toBeNull();
    // Expired
    expect(verifyCertUploadToken(createCertUploadToken(42, Date.now() - 1000))).toBeNull();
    // A login session token must NOT validate as a cert token (different HMAC prefix).
    const { createSessionValue } = await import('@/lib/practitionerAuth');
    expect(verifyCertUploadToken(createSessionValue(42))).toBeNull();
  });
});

describe('setCertification', () => {
  it('attaches a certification to a practitioner', async () => {
    const { insertApplication, setCertification, getPractitioner } = await import('@/lib/db');
    const p = await insertApplication({
      name: 'Sam Student', email: 'sam@example.com', registerBody: 'BANT',
      registerNumber: '321', qualificationStatus: 'student',
    });
    expect(p.certificationUrl).toBeNull();
    await setCertification(p.id, {
      url: 'https://blob.example/cert.pdf', pathname: 'certifications/x.pdf', filename: 'my-cert.pdf',
    });
    const after = await getPractitioner(p.id);
    expect(after!.certificationUrl).toBe('https://blob.example/cert.pdf');
    expect(after!.certificationFilename).toBe('my-cert.pdf');
    expect(after!.certificationUploadedAt).not.toBeNull();
  });
});

describe('processApplication — student path', () => {
  it('flags a student and emails a certification request', async () => {
    const { processApplication } = await import('@/lib/pipeline');
    const { listEvents } = await import('@/lib/db');
    const p = await processApplication({
      name: 'Sam Student', email: 'sam@example.com', registerBody: 'BANT',
      registerNumber: '321', qualificationStatus: 'student',
    });
    expect(p.status).toBe('flagged');
    expect(p.verification?.reasonCode).toBe('STUDENT_MANUAL');
    const events = await listEvents(p.id);
    expect(events.some((e) => e.type === 'email' && /Certification request emailed/.test(e.detail))).toBe(true);
  });

  it('does NOT email a qualified applicant a certification request', async () => {
    // Register lookup runs for a qualified applicant — stub it to a no-match page
    // (no network); result is flagged NO_MATCH, but not a student, so no cert email.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<div>no match here</div>', { status: 200 })));
    const { processApplication } = await import('@/lib/pipeline');
    const { listEvents } = await import('@/lib/db');
    const p = await processApplication({
      name: 'Quinn Qualified', email: 'quinn@example.com', registerBody: 'BANT',
      registerNumber: '654', qualificationStatus: 'qualified',
    });
    const events = await listEvents(p.id);
    expect(events.some((e) => /Certification request emailed/.test(e.detail))).toBe(false);
  });
});
