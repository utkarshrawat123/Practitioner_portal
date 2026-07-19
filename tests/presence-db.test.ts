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

  it('listOnlinePractitioners includes touched approved practitioners, excludes never-seen', async () => {
    const online = await seedApproved('on@example.com', 'On Line');
    const offline = await seedApproved('off@example.com', 'Off Line');
    const db = await import('@/lib/db');
    await db.touchPresence(online.id);
    const ids = (await db.listOnlinePractitioners()).map((r) => r.id);
    expect(ids).toContain(online.id);
    expect(ids).not.toContain(offline.id);
  });

  it('listOnlinePractitioners excludes practitioners seen longer ago than the window', async () => {
    const p = await seedApproved('stale@example.com', 'Stale One');
    const db = await import('@/lib/db');
    await db.touchPresence(p.id);
    // Backdate the heartbeat to 200s ago — well outside the 90s window.
    await db.execForTests(
      `UPDATE practitioners SET last_seen_at = datetime('now', '-200 seconds') WHERE id = ?`,
      [p.id]
    );
    const ids = (await db.listOnlinePractitioners()).map((r) => r.id);
    expect(ids).not.toContain(p.id);
    // But a wide enough window includes them again.
    const wideIds = (await db.listOnlinePractitioners(500)).map((r) => r.id);
    expect(wideIds).toContain(p.id);
  });

  it('listOnlinePractitioners surfaces the open conversation id when one exists', async () => {
    const p = await seedApproved('c@example.com', 'Convo Haver');
    const db = await import('@/lib/db');
    await db.touchPresence(p.id);
    let row = (await db.listOnlinePractitioners()).find((r) => r.id === p.id)!;
    expect(row.conversationId).toBeNull();
    const convo = await db.getOrCreateOpenConversation(p.id, 'hi');
    row = (await db.listOnlinePractitioners()).find((r) => r.id === p.id)!;
    expect(row.conversationId).toBe(convo.id);
  });

  it('excludes non-approved practitioners even if touched', async () => {
    const { insertApplication } = await import('@/lib/db');
    const pending = await insertApplication({
      name: 'Pending Person', email: 'pend@example.com', registerBody: 'BANT',
      registerNumber: '999', qualificationStatus: 'qualified',
    });
    const db = await import('@/lib/db');
    await db.touchPresence(pending.id);
    const ids = (await db.listOnlinePractitioners()).map((r) => r.id);
    expect(ids).not.toContain(pending.id);
  });

  it('listConversationsForAdmin marks a conversation online when its practitioner was just seen', async () => {
    const p = await seedApproved('conv-online@example.com', 'Conv Online');
    const db = await import('@/lib/db');
    await db.getOrCreateOpenConversation(p.id, 'hi');
    await db.touchPresence(p.id);
    const list = await db.listConversationsForAdmin();
    const row = list.find((c) => c.practitionerId === p.id)!;
    expect(row.online).toBe(true);
  });
});
