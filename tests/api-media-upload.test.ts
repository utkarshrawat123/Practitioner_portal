import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { POST } from '@/app/api/admin/media/upload/route';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-upload-'));
  process.env.LOCAL_UPLOAD_DIR = dir;
  process.env.ADMIN_PASSWORD = 'pw';
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function adminCookie(): Promise<string> {
  const { adminToken } = await import('@/lib/adminAuth');
  return `wn_admin=${adminToken()}`;
}

function uploadReq(fields: { file?: File; pathname?: string }, cookie?: string): Request {
  const fd = new FormData();
  if (fields.file) fd.append('file', fields.file);
  if (fields.pathname !== undefined) fd.append('pathname', fields.pathname);
  return new Request('http://x/api/admin/media/upload', {
    method: 'POST',
    headers: cookie ? { cookie } : {},
    body: fd,
  });
}

describe('POST /api/admin/media/upload (server-side upload)', () => {
  it('401s without the admin cookie', async () => {
    const res = await POST(uploadReq({ file: new File(['x'], 'a.pdf', { type: 'application/pdf' }), pathname: 'media/a.pdf' }));
    expect(res.status).toBe(401);
  });

  it('stores the file and returns its url + pathname', async () => {
    const cookie = await adminCookie();
    const res = await POST(
      uploadReq({ file: new File(['hello'], 'a.pdf', { type: 'application/pdf' }), pathname: 'media/a.pdf' }, cookie)
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string; pathname: string };
    expect(json.pathname).toBe('media/a.pdf');
    expect(json.url).toBe('/api/files/media/a.pdf');
    expect(fs.readFileSync(path.join(dir, 'media/a.pdf'), 'utf8')).toBe('hello');
  });

  it('rejects a pathname outside the allowed folders', async () => {
    const cookie = await adminCookie();
    const res = await POST(
      uploadReq({ file: new File(['x'], 'a.pdf', { type: 'application/pdf' }), pathname: 'secrets/a.pdf' }, cookie)
    );
    expect(res.status).toBe(400);
  });

  it('rejects an unsupported content type', async () => {
    const cookie = await adminCookie();
    const res = await POST(
      uploadReq({ file: new File(['x'], 'a.exe', { type: 'application/x-msdownload' }), pathname: 'media/a.exe' }, cookie)
    );
    expect(res.status).toBe(415);
  });
});
