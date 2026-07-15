import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-widgets-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('homepage widgets db', () => {
  it('creates, reads, lists (ordered by position), updates and deletes', async () => {
    const db = await import('@/lib/db');
    const a = await db.createHomepageWidget({ title: 'Card A', position: 2 });
    const b = await db.createHomepageWidget({ title: 'Card B', position: 1, body: 'hello', linkUrl: 'https://x.test/a' });
    expect(a.published).toBe(true);
    expect(a.audience).toBe('all');
    const list = await db.listHomepageWidgets();
    expect(list.map((w) => w.title)).toEqual(['Card B', 'Card A']); // position asc
    const upd = await db.updateHomepageWidget(a.id, { title: 'Card A2', published: false, position: 5 });
    expect(upd!.title).toBe('Card A2');
    expect(upd!.published).toBe(false);
    await db.deleteHomepageWidget(b.id);
    expect(await db.getHomepageWidget(b.id)).toBeNull();
  });

  it('listPublishedWidgetsFor hides unpublished and respects audience', async () => {
    const db = await import('@/lib/db');
    await db.createHomepageWidget({ title: 'Everyone', audience: 'all', position: 0 });
    await db.createHomepageWidget({ title: 'Qualified only', audience: 'qualified', position: 1 });
    await db.createHomepageWidget({ title: 'Student only', audience: 'student', position: 2 });
    const hidden = await db.createHomepageWidget({ title: 'Hidden', audience: 'all', position: 3 });
    await db.updateHomepageWidget(hidden.id, { published: false });

    const qualified = await db.listPublishedWidgetsFor('qualified');
    expect(qualified.map((w) => w.title)).toEqual(['Everyone', 'Qualified only']);
    const student = await db.listPublishedWidgetsFor('student');
    expect(student.map((w) => w.title)).toEqual(['Everyone', 'Student only']);
    const anon = await db.listPublishedWidgetsFor(null);
    expect(anon.map((w) => w.title)).toEqual(['Everyone']);
  });
});
