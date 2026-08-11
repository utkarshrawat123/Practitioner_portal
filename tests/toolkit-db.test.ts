import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-toolkit-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('toolkit_resources db', () => {
  it('creates, reads back, updates and deletes a resource', async () => {
    const db = await import('@/lib/db');
    const r = await db.createToolkitResource({
      title: 'Iron protocol decision tree', type: 'decision_tree',
      description: 'When to supplement iron', audience: 'all', contentKind: 'link',
      url: 'https://example.com/tree',
    });
    expect(r.id).toBeGreaterThan(0);
    expect(r.published).toBe(true);
    expect((await db.getToolkitResource(r.id))?.title).toBe('Iron protocol decision tree');

    const updated = await db.updateToolkitResource(r.id, { published: false, title: 'Iron tree v2' });
    expect(updated?.published).toBe(false);
    expect(updated?.title).toBe('Iron tree v2');

    await db.deleteToolkitResource(r.id);
    expect(await db.getToolkitResource(r.id)).toBeNull();
  });

  it('lists only published resources and filters by audience', async () => {
    const db = await import('@/lib/db');
    await db.createToolkitResource({ title: 'Everyone FAQ', type: 'faq', contentKind: 'text', body: 'Q&A', audience: 'all' });
    await db.createToolkitResource({ title: 'Student only', type: 'handout', contentKind: 'link', url: 'https://x', audience: 'student' });
    await db.createToolkitResource({ title: 'Draft', type: 'recipe', contentKind: 'text', body: 'hidden', audience: 'all', published: false });

    const qualified = await db.listPublishedToolkitResourcesFor('qualified');
    const titles = qualified.map((r) => r.title);
    expect(titles).toContain('Everyone FAQ');
    expect(titles).not.toContain('Student only'); // wrong audience
    expect(titles).not.toContain('Draft');        // unpublished

    const byType = await db.listPublishedToolkitResourcesFor('student', 'handout');
    expect(byType.map((r) => r.title)).toEqual(['Student only']);
  });
});
