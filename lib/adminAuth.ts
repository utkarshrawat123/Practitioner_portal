import { createHash, timingSafeEqual } from 'crypto';

export function adminToken(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('ADMIN_PASSWORD is not set');
  return createHash('sha256').update(password).digest('hex');
}

export function isAuthed(req: Request): boolean {
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)wn_admin=([a-f0-9]{64})/);
  if (!match) return false;
  try {
    const expected = Buffer.from(adminToken());
    const provided = Buffer.from(match[1]);
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}
