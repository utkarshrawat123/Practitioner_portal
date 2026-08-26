import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-notif-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function practitioner(email: string, approve = true) {
  const { insertApplication, execForTests } = await import('@/lib/db');
  const p = await insertApplication({
    name: 'Notif Test', email, registerBody: 'BANT',
    registerNumber: '111', qualificationStatus: 'qualified',
  });
  if (approve) await execForTests(`UPDATE practitioners SET status = 'approved' WHERE id = ?`, [p.id]);
  return p;
}

describe('020_notifications migration', () => {
  it('creates the notifications table', async () => {
    const { execForTests } = await import('@/lib/db');
    const names = (await execForTests("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((r) => r.name as string);
    expect(names).toContain('notifications');
  });
});

describe('notification core', () => {
  it('writes one row per practitioner', async () => {
    const { notifyPractitioners, listNotifications } = await import('@/lib/db');
    const a = await practitioner('n1@example.com');
    const b = await practitioner('n2@example.com');
    await notifyPractitioners([a.id, b.id], { kind: 'content', title: 'New lesson', href: '/library' });

    expect(await listNotifications(a.id)).toHaveLength(1);
    expect(await listNotifications(b.id)).toHaveLength(1);
    expect((await listNotifications(a.id))[0].title).toBe('New lesson');
  });

  it('is a no-op for an empty recipient list', async () => {
    const { notifyPractitioners } = await import('@/lib/db');
    await expect(notifyPractitioners([], { kind: 'content', title: 'nobody' })).resolves.toBeUndefined();
  });

  it('counts only unread', async () => {
    const { notifyPractitioners, unreadNotificationCount, markNotificationsRead } = await import('@/lib/db');
    const p = await practitioner('n3@example.com');
    await notifyPractitioners([p.id], { kind: 'content', title: 'One' });
    await notifyPractitioners([p.id], { kind: 'content', title: 'Two' });
    expect(await unreadNotificationCount(p.id)).toBe(2);

    await markNotificationsRead(p.id);
    expect(await unreadNotificationCount(p.id)).toBe(0);
  });

  it('marks a single notification read when given an id', async () => {
    const { notifyPractitioners, listNotifications, markNotificationsRead, unreadNotificationCount } = await import('@/lib/db');
    const p = await practitioner('n4@example.com');
    await notifyPractitioners([p.id], { kind: 'content', title: 'One' });
    await notifyPractitioners([p.id], { kind: 'content', title: 'Two' });
    const [first] = await listNotifications(p.id);

    await markNotificationsRead(p.id, first.id);
    expect(await unreadNotificationCount(p.id)).toBe(1);
  });

  it('never touches another practitioner’s rows', async () => {
    const { notifyPractitioners, markNotificationsRead, unreadNotificationCount } = await import('@/lib/db');
    const a = await practitioner('n5@example.com');
    const b = await practitioner('n6@example.com');
    await notifyPractitioners([a.id, b.id], { kind: 'content', title: 'Shared' });

    await markNotificationsRead(a.id);
    expect(await unreadNotificationCount(a.id)).toBe(0);
    expect(await unreadNotificationCount(b.id)).toBe(1);
  });

  it('returns newest first', async () => {
    const { notifyPractitioners, listNotifications, execForTests } = await import('@/lib/db');
    const p = await practitioner('n7@example.com');
    await notifyPractitioners([p.id], { kind: 'content', title: 'Older' });
    await notifyPractitioners([p.id], { kind: 'content', title: 'Newer' });
    await execForTests(`UPDATE notifications SET created_at = '2020-01-01 00:00:00' WHERE title = 'Older'`);

    expect((await listNotifications(p.id)).map((n) => n.title)).toEqual(['Newer', 'Older']);
  });
});
