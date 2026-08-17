import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GET } from '@/app/api/files/[...key]/route';

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

describe('GET /api/files/[...key]', () => {
  beforeEach(() => {
    process.env.LOCAL_UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'files-'));
    const dir = path.join(process.env.LOCAL_UPLOAD_DIR, 'certifications');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.pdf'), 'PDF');
    fs.writeFileSync(path.join(dir, 'a.pdf.type'), 'application/pdf');
    fs.mkdirSync(path.join(process.env.LOCAL_UPLOAD_DIR, 'media'), { recursive: true });
    fs.writeFileSync(path.join(process.env.LOCAL_UPLOAD_DIR, 'media', 'clip.txt'), 'video');
  });

  it('401s on a certification file without admin auth', async () => {
    const res = await GET(req('http://x/api/files/certifications/a.pdf'), {
      params: Promise.resolve({ key: ['certifications', 'a.pdf'] }),
    });
    expect(res.status).toBe(401);
  });

  it('serves a public media file without auth', async () => {
    const res = await GET(req('http://x/api/files/media/clip.txt'), {
      params: Promise.resolve({ key: ['media', 'clip.txt'] }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('video');
  });

  it('404s on a missing public key', async () => {
    const res = await GET(req('http://x/api/files/media/missing.txt'), {
      params: Promise.resolve({ key: ['media', 'missing.txt'] }),
    });
    expect(res.status).toBe(404);
  });
});
