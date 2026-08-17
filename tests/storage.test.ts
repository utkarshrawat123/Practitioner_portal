import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { putObject, getObject, deleteObjects, keyToUrl } from '@/lib/storage';

describe('storage (local disk fallback)', () => {
  beforeEach(() => {
    process.env.LOCAL_UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));
    delete process.env.R2_PUBLIC_BASE;
  });

  it('puts and gets a private object round-trip', async () => {
    const { key, url } = await putObject('certifications/x.txt', Buffer.from('hi'), {
      access: 'private',
      contentType: 'text/plain',
    });
    expect(key).toBe('certifications/x.txt');
    expect(url).toBe('/api/files/certifications/x.txt');
    const got = await getObject(key);
    expect(got?.contentType).toBe('text/plain');
    expect(Buffer.isBuffer(got?.body) ? (got!.body as Buffer).toString() : '').toBe('hi');
  });

  it('deletes objects', async () => {
    await putObject('media/y.txt', Buffer.from('yo'), { access: 'public' });
    await deleteObjects(['media/y.txt']);
    expect(await getObject('media/y.txt')).toBeNull();
  });

  it('private keyToUrl is always the gated route', () => {
    expect(keyToUrl('certifications/z', 'private')).toBe('/api/files/certifications/z');
  });

  it('public keyToUrl uses R2_PUBLIC_BASE when set, else the gated route', () => {
    expect(keyToUrl('media/a', 'public')).toBe('/api/files/media/a');
    process.env.R2_PUBLIC_BASE = 'https://cdn.example.com/';
    expect(keyToUrl('media/a', 'public')).toBe('https://cdn.example.com/media/a');
  });
});
