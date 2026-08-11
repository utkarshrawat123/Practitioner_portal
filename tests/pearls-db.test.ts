import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-pearls-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('clinical_pearls db', () => {
  it('creates drafts, publishes, and filters published by audience', async () => {
    const db = await import('@/lib/db');
    const draft = await db.createClinicalPearl({ body: 'Take iron with vitamin C', source: 'content-factory' });
    expect(draft.status).toBe('draft');

    // Drafts are not shown to practitioners.
    expect(await db.listPublishedPearlsFor('qualified')).toHaveLength(0);

    await db.updateClinicalPearl(draft.id, { status: 'published' });
    await db.createClinicalPearl({ body: 'Students: revise the HPA axis', audience: 'student', status: 'published' });

    const forQualified = await db.listPublishedPearlsFor('qualified');
    expect(forQualified.map((p) => p.body)).toContain('Take iron with vitamin C');
    expect(forQualified.map((p) => p.body)).not.toContain('Students: revise the HPA axis');

    await db.deleteClinicalPearl(draft.id);
    expect(await db.getClinicalPearl(draft.id)).toBeNull();
  });
});
