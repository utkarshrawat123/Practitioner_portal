import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-saved-read-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function practitioner(email: string) {
  const { insertApplication } = await import('@/lib/db');
  return insertApplication({
    name: 'Reader', email, registerBody: 'BANT',
    registerNumber: '321', qualificationStatus: 'qualified',
  });
}

async function toolkitRow(audience: 'all' | 'qualified' | 'student', published = 1) {
  const { execForTests } = await import('@/lib/db');
  await execForTests(
    `INSERT INTO toolkit_resources (title, type, description, audience, content_kind, url, published)
     VALUES ('Iron guide', 'protocol', 'Ferritin in context', ?, 'link', 'https://example.org/x', ?)`,
    [audience, published]
  );
  const row = await execForTests(`SELECT last_insert_rowid() AS id`);
  return Number(row.rows[0].id);
}

describe('listSavedItems', () => {
  it('returns a saved toolkit item with title and description', async () => {
    const { saveItem, listSavedItems } = await import('@/lib/db');
    const p = await practitioner('r1@example.com');
    const id = await toolkitRow('all');
    await saveItem(p.id, 'toolkit', id);

    const items = await listSavedItems(p.id, 'qualified');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Iron guide');
    expect(items[0].itemType).toBe('toolkit');
    expect(items[0].itemId).toBe(id);
  });

  it('drops an orphan whose source row was deleted', async () => {
    const { saveItem, listSavedItems, execForTests } = await import('@/lib/db');
    const p = await practitioner('r2@example.com');
    const id = await toolkitRow('all');
    await saveItem(p.id, 'toolkit', id);
    await execForTests(`DELETE FROM toolkit_resources WHERE id = ?`, [id]);

    expect(await listSavedItems(p.id, 'qualified')).toHaveLength(0);
  });

  it('drops an item unpublished after it was saved', async () => {
    const { saveItem, listSavedItems, execForTests } = await import('@/lib/db');
    const p = await practitioner('r3@example.com');
    const id = await toolkitRow('all');
    await saveItem(p.id, 'toolkit', id);
    await execForTests(`UPDATE toolkit_resources SET published = 0 WHERE id = ?`, [id]);

    expect(await listSavedItems(p.id, 'qualified')).toHaveLength(0);
  });

  it('re-applies audience gating on read when qualification changes', async () => {
    const { saveItem, listSavedItems } = await import('@/lib/db');
    const p = await practitioner('r4@example.com');
    const id = await toolkitRow('qualified');
    await saveItem(p.id, 'toolkit', id);

    // Visible while qualified…
    expect(await listSavedItems(p.id, 'qualified')).toHaveLength(1);
    // …and gone once they are not. Gating at save time would have leaked this.
    expect(await listSavedItems(p.id, 'student')).toHaveLength(0);
  });

  it('returns newest saves first', async () => {
    const { saveItem, listSavedItems, execForTests } = await import('@/lib/db');
    const p = await practitioner('r5@example.com');
    const first = await toolkitRow('all');
    const second = await toolkitRow('all');
    await saveItem(p.id, 'toolkit', first);
    await saveItem(p.id, 'toolkit', second);
    // Force a distinct timestamp so ordering is deterministic rather than tie-broken.
    await execForTests(
      `UPDATE saved_items SET created_at = '2020-01-01 00:00:00' WHERE item_id = ?`,
      [first]
    );

    const items = await listSavedItems(p.id, 'qualified');
    expect(items.map((i) => i.itemId)).toEqual([second, first]);
  });

  it('returns an empty array for a practitioner who has saved nothing', async () => {
    const { listSavedItems } = await import('@/lib/db');
    const p = await practitioner('r6@example.com');
    expect(await listSavedItems(p.id, 'qualified')).toEqual([]);
  });
});
