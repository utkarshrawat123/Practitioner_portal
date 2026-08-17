import fs from 'fs';
import path from 'path';
import { getR2Binding } from '@/lib/db/binding';

export type Access = 'public' | 'private';

function localDir(): string {
  return process.env.LOCAL_UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads');
}

/**
 * Resolve the public-facing URL for a stored object.
 * - `private` → always the auth-gated `/api/files/<key>` route (certificates).
 * - `public`  → the R2 public base when configured, else the gated route
 *   (which serves fine locally where there is no public bucket).
 */
export function keyToUrl(key: string, access: Access): string {
  if (access === 'private') return `/api/files/${key}`;
  const base = process.env.R2_PUBLIC_BASE;
  return base ? `${base.replace(/\/$/, '')}/${key}` : `/api/files/${key}`;
}

async function toBuffer(body: ArrayBuffer | Uint8Array | Blob | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer());
  return Buffer.from(body as ArrayBuffer);
}

/** Store an object under `key`. Uses R2 on Workers, local disk otherwise. */
export async function putObject(
  key: string,
  body: ArrayBuffer | Uint8Array | Blob | Buffer,
  opts: { contentType?: string; access: Access }
): Promise<{ key: string; url: string }> {
  const bucket = getR2Binding();
  if (bucket) {
    const buf = await toBuffer(body);
    await bucket.put(key, buf, {
      httpMetadata: opts.contentType ? { contentType: opts.contentType } : undefined,
    });
    return { key, url: keyToUrl(key, opts.access) };
  }
  const full = path.join(localDir(), key);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, await toBuffer(body));
  if (opts.contentType) fs.writeFileSync(`${full}.type`, opts.contentType);
  return { key, url: keyToUrl(key, opts.access) };
}

/** Fetch an object by key, or null if it doesn't exist. */
export async function getObject(
  key: string
): Promise<{ body: ReadableStream | Buffer; contentType: string } | null> {
  const bucket = getR2Binding();
  if (bucket) {
    const obj = await bucket.get(key);
    if (!obj) return null;
    return {
      body: obj.body as unknown as ReadableStream,
      contentType: obj.httpMetadata?.contentType || 'application/octet-stream',
    };
  }
  const full = path.join(localDir(), key);
  if (!fs.existsSync(full)) return null;
  const contentType = fs.existsSync(`${full}.type`)
    ? fs.readFileSync(`${full}.type`, 'utf8')
    : 'application/octet-stream';
  return { body: fs.readFileSync(full), contentType };
}

/** Delete objects by key (no-op for keys that don't exist). */
export async function deleteObjects(keys: string[]): Promise<void> {
  const bucket = getR2Binding();
  if (bucket) {
    await Promise.all(keys.map((k) => bucket.delete(k)));
    return;
  }
  for (const key of keys) {
    const full = path.join(localDir(), key);
    try {
      fs.rmSync(full, { force: true });
      fs.rmSync(`${full}.type`, { force: true });
    } catch {
      /* ignore */
    }
  }
}
