import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-presence-db-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved(email = 'p1@example.com', name = 'Pat One') {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name, email, registerBody: 'BANT', registerNumber: '12345', qualificationStatus: 'qualified',
  });
  const code = `WN-${p.id}-AB2C`;
  await markApproved(p.id, {
    affiliateCode: code, affiliateLink: `http://x/r/${code}`, pendingSync: false, decidedBy: 'system',
  });
  return p;
}

describe('presence store', () => {
  it('touchPresence sets last_seen_at on the practitioner', async () => {
    const p = await seedApproved();
    const db = await import('@/lib/db');
    expect((await db.getPractitioner(p.id))!.lastSeenAt).toBeNull();
    await db.touchPresence(p.id);
    const after = await db.getPractitioner(p.id);
    expect(after!.lastSeenAt).not.toBeNull();
  });

  it('exports PRESENCE_WINDOW_SECONDS = 90', async () => {
    const db = await import('@/lib/db');
    expect(db.PRESENCE_WINDOW_SECONDS).toBe(90);
  });
});
