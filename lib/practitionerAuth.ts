import { createHmac, timingSafeEqual } from 'crypto';
import { getPractitioner, type Practitioner } from '@/lib/db';

const COOKIE = 'wn_session';
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

function secret(): string {
  return process.env.SESSION_SECRET || 'dev-secret-change-me';
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

export function createSessionValue(
  practitionerId: number,
  expiresAtMs: number = Date.now() + THIRTY_DAYS_S * 1000
): string {
  const payload = `${practitionerId}.${expiresAtMs}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionValue(value: string): number | null {
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [idStr, expStr, mac] = parts;
  const expected = sign(`${idStr}.${expStr}`);
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  } catch {
    return null;
  }
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const id = Number(idStr);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function sessionCookieHeader(practitionerId: number): string {
  return `${COOKIE}=${createSessionValue(practitionerId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${THIRTY_DAYS_S}`;
}

export function clearSessionCookieHeader(): string {
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export async function getSessionPractitioner(req: Request): Promise<Practitioner | null> {
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)wn_session=([^;]+)/);
  if (!match) return null;
  const id = verifySessionValue(match[1]);
  return id ? getPractitioner(id) : null;
}
