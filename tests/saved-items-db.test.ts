import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-saved-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function makePractitioner(email: string) {
  const { insertApplication } = await import('@/lib/db');
  return insertApplication({
    name: 'Saver Test', email, registerBody: 'BANT',
    registerNumber: '123', qualificationStatus: 'qualified',
  });
}

describe('019_saved_items migration', () => {
  it('creates the saved_items table', async () => {
    const { execForTests } = await import('@/lib/db');
    const rows = (await execForTests("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((r) => r.name as string);
    expect(rows).toContain('saved_items');
  });
});

describe('saveItem / unsaveItem / savedItemRefs', () => {
  it('saving twice yields exactly one row', async () => {
    const { saveItem, savedItemRefs } = await import('@/lib/db');
    const p = await makePractitioner('save1@example.com');
    await saveItem(p.id, 'toolkit', 7);
    await saveItem(p.id, 'toolkit', 7);
    const refs = await savedItemRefs(p.id);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ itemType: 'toolkit', itemId: 7 });
  });

  it('unsaves, and unsaving something never saved is a no-op', async () => {
    const { saveItem, unsaveItem, savedItemRefs } = await import('@/lib/db');
    const p = await makePractitioner('save2@example.com');
    await saveItem(p.id, 'lesson', 3);
    await unsaveItem(p.id, 'lesson', 3);
    expect(await savedItemRefs(p.id)).toHaveLength(0);
    await expect(unsaveItem(p.id, 'lesson', 999)).resolves.toBeUndefined();
  });

  it('keeps each practitioner’s saves separate', async () => {
    const { saveItem, savedItemRefs } = await import('@/lib/db');
    const a = await makePractitioner('a@example.com');
    const b = await makePractitioner('b@example.com');
    await saveItem(a.id, 'media', 1);
    await saveItem(b.id, 'media', 2);
    expect(await savedItemRefs(a.id)).toEqual([{ itemType: 'media', itemId: 1 }]);
    expect(await savedItemRefs(b.id)).toEqual([{ itemType: 'media', itemId: 2 }]);
  });

  it('the same item id in different types does not collide', async () => {
    const { saveItem, savedItemRefs } = await import('@/lib/db');
    const p = await makePractitioner('save3@example.com');
    await saveItem(p.id, 'toolkit', 5);
    await saveItem(p.id, 'media', 5);
    await saveItem(p.id, 'lesson', 5);
    expect(await savedItemRefs(p.id)).toHaveLength(3);
  });
});
