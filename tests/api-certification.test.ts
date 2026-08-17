import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const put = vi.fn(async () => ({ key: 'certifications/cert.pdf', url: '/api/files/certifications/cert.pdf' }));
vi.mock('@/lib/storage', () => ({ putObject: (...a: unknown[]) => put(...a) }));

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-cert-api-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.SESSION_SECRET = 'test-secret';
  put.mockClear();
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedStudent() {
  const { insertApplication } = await import('@/lib/db');
  return insertApplication({
    name: 'Sam Student', email: 'sam@example.com', registerBody: 'BANT',
    registerNumber: '321', qualificationStatus: 'student',
  });
}

function fileForm(name: string, type: string, bytes = 10) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(bytes)], name, { type }));
  return form;
}

describe('GET /api/certification (validate link)', () => {
  it('401s on a bad/absent token, 200 with the applicant name on a good one', async () => {
    const p = await seedStudent();
    const { createCertUploadToken } = await import('@/lib/certUpload');
    const { GET } = await import('@/app/api/certification/route');

    expect((await GET(new Request('http://x/api/certification'))).status).toBe(401);
    expect((await GET(new Request('http://x/api/certification?token=nope'))).status).toBe(401);

    const token = createCertUploadToken(p.id);
    const ok = await GET(new Request(`http://x/api/certification?token=${token}`));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.name).toBe('Sam Student');
    expect(body.alreadyUploaded).toBe(false);
  });
});

describe('POST /api/certification (upload)', () => {
  it('401s without a valid token', async () => {
    const { POST } = await import('@/app/api/certification/route');
    const res = await POST(new Request('http://x/api/certification', { method: 'POST', body: fileForm('c.pdf', 'application/pdf') }));
    expect(res.status).toBe(401);
    expect(put).not.toHaveBeenCalled();
  });

  it('400s when no file / wrong type', async () => {
    const p = await seedStudent();
    const { createCertUploadToken } = await import('@/lib/certUpload');
    const { POST } = await import('@/app/api/certification/route');
    const token = createCertUploadToken(p.id);

    const noFile = await POST(new Request(`http://x/api/certification?token=${token}`, { method: 'POST', body: new FormData() }));
    expect(noFile.status).toBe(400);

    const badType = await POST(new Request(`http://x/api/certification?token=${token}`, {
      method: 'POST', body: fileForm('c.exe', 'application/x-msdownload'),
    }));
    expect(badType.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it('stores the file, attaches it to the practitioner and logs an event', async () => {
    const p = await seedStudent();
    const { createCertUploadToken } = await import('@/lib/certUpload');
    const { POST } = await import('@/app/api/certification/route');
    const token = createCertUploadToken(p.id);

    const res = await POST(new Request(`http://x/api/certification?token=${token}`, {
      method: 'POST', body: fileForm('proof.pdf', 'application/pdf'),
    }));
    expect(res.status).toBe(200);
    expect(put).toHaveBeenCalledTimes(1);

    const { getPractitioner, listEvents } = await import('@/lib/db');
    const after = await getPractitioner(p.id);
    expect(after!.certificationUrl).toBe('/api/files/certifications/cert.pdf');
    expect(after!.certificationFilename).toBe('proof.pdf');
    const events = await listEvents(p.id);
    expect(events.some((e) => e.type === 'certification')).toBe(true);
  });
});
