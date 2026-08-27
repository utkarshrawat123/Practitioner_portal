import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * A lesson can be completed two ways: from /library (lesson_completions) or as a
 * pathway module (module_completions). `pathwayProgress` has always unioned the
 * first into the second, but nothing unioned the second back — so finishing a
 * lesson inside a pathway left every lesson count reading zero. That is what put
 * "0 lessons completed" on the dashboard of a practitioner who had finished two
 * whole pathways.
 */

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-completion-union-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

let seq = 0;
async function seedPractitioner(email = 'union@example.com') {
  const { insertApplication, markApproved } = await import('@/lib/db');
  seq += 1;
  const p = await insertApplication({
    name: 'Jane Smith', email, registerBody: 'BANT',
    // register_number and affiliate_code are both UNIQUE — vary them so a test
    // can seed more than one practitioner.
    registerNumber: `1234${seq}`, qualificationStatus: 'qualified',
  });
  return markApproved(p.id, { affiliateCode: `WN-X-${seq}`, affiliateLink: 'x', pendingSync: false, decidedBy: 'system' });
}
async function seedLesson(title: string) {
  const db = await import('@/lib/db');
  const id = await db.insertLesson({
    sourceFile: 's', title, summary: 'x', takeaways: [],
    quiz: { questions: [] } as never, topics: [], claimFlags: [],
  });
  await db.setLessonStatus(id, 'published');
  return id;
}

describe('lesson completion union (read side)', () => {
  it('counts a lesson completed as a pathway module', async () => {
    const db = await import('@/lib/db');
    const p = await seedPractitioner();
    const lesson = await seedLesson('Lesson A');
    const pathway = await db.createPathway({ title: 'Path', cpdHours: 1, published: true });
    const mod = await db.addPathwayModule(pathway.id, {
      title: 'M1', contentKind: 'lesson', contentId: lesson, position: 0, required: true,
    });

    expect(await db.countCompletions(p.id)).toBe(0);
    await db.markModuleComplete(p.id, mod.id);
    expect(await db.countCompletions(p.id)).toBe(1);
  });

  it('does not double-count a lesson completed both ways', async () => {
    const db = await import('@/lib/db');
    const p = await seedPractitioner();
    const lesson = await seedLesson('Lesson A');
    const pathway = await db.createPathway({ title: 'Path', cpdHours: 1, published: true });
    const mod = await db.addPathwayModule(pathway.id, {
      title: 'M1', contentKind: 'lesson', contentId: lesson, position: 0, required: true,
    });

    await db.markModuleComplete(p.id, mod.id);
    await db.toggleCompletion(p.id, lesson);
    expect(await db.countCompletions(p.id)).toBe(1);
    expect(await db.completedLessonIds(p.id)).toEqual([lesson]);
  });

  it('does not count a non-lesson module as a lesson', async () => {
    const db = await import('@/lib/db');
    const p = await seedPractitioner();
    const pathway = await db.createPathway({ title: 'Path', cpdHours: 1, published: true });
    // contentId 1 is a media id here, and must not be read as a lesson id.
    const mod = await db.addPathwayModule(pathway.id, {
      title: 'Watch', contentKind: 'media', contentId: 1, position: 0, required: false,
    });

    await db.markModuleComplete(p.id, mod.id);
    expect(await db.countCompletions(p.id)).toBe(0);
    expect(await db.completedLessonIds(p.id)).toEqual([]);
  });

  it('completedLessonIds includes pathway-completed lessons, sorted and unique', async () => {
    const db = await import('@/lib/db');
    const p = await seedPractitioner();
    const a = await seedLesson('A');
    const b = await seedLesson('B');
    const pathway = await db.createPathway({ title: 'Path', cpdHours: 2, published: true });
    const m1 = await db.addPathwayModule(pathway.id, { title: 'M1', contentKind: 'lesson', contentId: a, position: 0, required: true });
    const m2 = await db.addPathwayModule(pathway.id, { title: 'M2', contentKind: 'lesson', contentId: b, position: 1, required: true });

    await db.markModuleComplete(p.id, m2.id);
    await db.markModuleComplete(p.id, m1.id);
    expect(await db.completedLessonIds(p.id)).toEqual([a, b].sort((x, y) => x - y));
  });

  it('keeps counts isolated per practitioner', async () => {
    const db = await import('@/lib/db');
    const p1 = await seedPractitioner('one@example.com');
    const p2 = await seedPractitioner('two@example.com');
    const lesson = await seedLesson('A');
    const pathway = await db.createPathway({ title: 'Path', cpdHours: 1, published: true });
    const mod = await db.addPathwayModule(pathway.id, { title: 'M1', contentKind: 'lesson', contentId: lesson, position: 0, required: true });

    await db.markModuleComplete(p1.id, mod.id);
    expect(await db.countCompletions(p1.id)).toBe(1);
    expect(await db.countCompletions(p2.id)).toBe(0);
  });
});

describe('lesson completion union (write side)', () => {
  it('completing a lesson in /library marks its pathway modules complete', async () => {
    const db = await import('@/lib/db');
    const p = await seedPractitioner();
    const lesson = await seedLesson('Shared lesson');
    // The same lesson can appear in more than one pathway — both must record.
    const pathA = await db.createPathway({ title: 'A', cpdHours: 1, published: true });
    const pathB = await db.createPathway({ title: 'B', cpdHours: 1, published: true });
    const mA = await db.addPathwayModule(pathA.id, { title: 'MA', contentKind: 'lesson', contentId: lesson, position: 0, required: true });
    const mB = await db.addPathwayModule(pathB.id, { title: 'MB', contentKind: 'lesson', contentId: lesson, position: 0, required: true });

    expect(await db.toggleCompletion(p.id, lesson)).toBe(true);
    const ids = await db.moduleCompletionIds(p.id);
    expect(ids).toContain(mA.id);
    expect(ids).toContain(mB.id);
  });

  it('un-completing a lesson removes the module records it created', async () => {
    const db = await import('@/lib/db');
    const p = await seedPractitioner();
    const lesson = await seedLesson('Shared lesson');
    const pathway = await db.createPathway({ title: 'A', cpdHours: 1, published: true });
    const mod = await db.addPathwayModule(pathway.id, { title: 'MA', contentKind: 'lesson', contentId: lesson, position: 0, required: true });

    await db.toggleCompletion(p.id, lesson);
    expect(await db.moduleCompletionIds(p.id)).toContain(mod.id);

    // Toggling off must not leave the module claiming completion — otherwise the
    // pathway would stay at 100% for a lesson the practitioner just un-ticked.
    expect(await db.toggleCompletion(p.id, lesson)).toBe(false);
    expect(await db.moduleCompletionIds(p.id)).not.toContain(mod.id);
    expect(await db.countCompletions(p.id)).toBe(0);
    expect((await db.pathwayProgress(p.id, pathway.id)).complete).toBe(false);
  });

  it('un-completing a lesson leaves an independently-completed module alone', async () => {
    const db = await import('@/lib/db');
    const p = await seedPractitioner();
    const lesson = await seedLesson('L');
    const other = await seedLesson('Other');
    const pathway = await db.createPathway({ title: 'A', cpdHours: 1, published: true });
    const mine = await db.addPathwayModule(pathway.id, { title: 'M1', contentKind: 'lesson', contentId: lesson, position: 0, required: true });
    const untouched = await db.addPathwayModule(pathway.id, { title: 'M2', contentKind: 'lesson', contentId: other, position: 1, required: true });

    await db.markModuleComplete(p.id, untouched.id);
    await db.toggleCompletion(p.id, lesson);
    await db.toggleCompletion(p.id, lesson);

    const ids = await db.moduleCompletionIds(p.id);
    expect(ids).not.toContain(mine.id);
    expect(ids).toContain(untouched.id);
  });
});
