import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-les-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

const draft = (over: Record<string, unknown> = {}) => ({
  sourceFile: 'talk.md',
  title: 'Magnesium and Sleep',
  summary: 'Magnesium supports normal muscle function.',
  takeaways: ['a', 'b', 'c'],
  quiz: { question: 'Q?', options: ['x', 'y'], correctIndex: 0, explanation: 'because' },
  topics: ['sleep'],
  claimFlags: [],
  model: 'claude-opus-4-8',
  inputTokens: 100,
  outputTokens: 40,
  ...over,
});

async function seedPractitioner() {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = insertApplication({
    name: 'Jane Smith', email: 'jane@example.com', registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus: 'qualified',
  });
  return markApproved(p.id, {
    affiliateCode: 'WN-SMITH-AB2C', affiliateLink: 'http://localhost:3100/r/WN-SMITH-AB2C',
    pendingSync: false, decidedBy: 'system',
  });
}

describe('lessons', () => {
  it('inserts and reads a lesson round-tripping JSON fields', async () => {
    const { insertLesson, getLesson } = await import('@/lib/db');
    const id = insertLesson(draft());
    const l = getLesson(id)!;
    expect(l.title).toBe('Magnesium and Sleep');
    expect(l.takeaways).toEqual(['a', 'b', 'c']);
    expect(l.quiz.correctIndex).toBe(0);
    expect(l.topics).toEqual(['sleep']);
    expect(l.status).toBe('draft');
  });

  it('lists by status newest first and edits then publishes', async () => {
    const { insertLesson, listLessons, updateLessonFields, setLessonStatus } = await import('@/lib/db');
    const a = insertLesson(draft({ title: 'First' }));
    const b = insertLesson(draft({ title: 'Second' }));
    expect(listLessons().map((l) => l.id)).toEqual([b, a]);
    expect(listLessons('draft')).toHaveLength(2);
    updateLessonFields(a, {
      title: 'Edited', summary: 'new', takeaways: ['x', 'y', 'z'],
      quiz: draft().quiz, topics: ['hormones'],
    });
    const published = setLessonStatus(a, 'published');
    expect(published.title).toBe('Edited');
    expect(published.status).toBe('published');
    expect(listLessons('published').map((l) => l.id)).toEqual([a]);
  });

  it('filters published lessons by topic and search text', async () => {
    const { insertLesson, setLessonStatus, listPublishedLessons } = await import('@/lib/db');
    const a = insertLesson(draft({ title: 'Iron basics', topics: ['iron-deficiency'], summary: 'ferritin low' }));
    const b = insertLesson(draft({ title: 'Sleep science', topics: ['sleep'], summary: 'magnesium calm' }));
    insertLesson(draft({ title: 'Still a draft', topics: ['sleep'] }));
    setLessonStatus(a, 'published');
    setLessonStatus(b, 'published');
    expect(listPublishedLessons().map((l) => l.id).sort()).toEqual([a, b].sort());
    expect(listPublishedLessons({ topic: 'iron-deficiency' }).map((l) => l.id)).toEqual([a]);
    expect(listPublishedLessons({ q: 'magnesium' }).map((l) => l.id)).toEqual([b]);
    expect(listPublishedLessons({ q: 'iron' }).map((l) => l.id)).toEqual([a]);
  });
});

describe('completions', () => {
  it('toggles completion, counts, and refuses unpublished lessons', async () => {
    const { insertLesson, setLessonStatus, toggleCompletion, countCompletions, completedLessonIds } =
      await import('@/lib/db');
    const p = await seedPractitioner();
    const pub = insertLesson(draft());
    setLessonStatus(pub, 'published');
    const stillDraft = insertLesson(draft({ title: 'draft' }));

    expect(toggleCompletion(p.id, pub)).toBe(true);
    expect(countCompletions(p.id)).toBe(1);
    expect(completedLessonIds(p.id)).toEqual([pub]);
    expect(toggleCompletion(p.id, pub)).toBe(false);
    expect(countCompletions(p.id)).toBe(0);

    expect(toggleCompletion(p.id, stillDraft)).toBe(false);
    expect(countCompletions(p.id)).toBe(0);
    expect(toggleCompletion(p.id, 9999)).toBe(false);
  });
});
