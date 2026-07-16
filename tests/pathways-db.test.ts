import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-pathways-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedPractitioner(qualificationStatus: 'qualified' | 'student' = 'qualified') {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name: 'Jane Smith', email: `${qualificationStatus}@example.com`, registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus,
  });
  return markApproved(p.id, { affiliateCode: 'WN-X-1', affiliateLink: 'x', pendingSync: false, decidedBy: 'system' });
}
async function seedLesson(title: string) {
  const db = await import('@/lib/db');
  const id = await db.insertLesson({ sourceFile: 's', title, summary: 'x', takeaways: [], quiz: { questions: [] } as never, topics: [], claimFlags: [] });
  await db.setLessonStatus(id, 'published');
  return id;
}

describe('pathways db', () => {
  it('creates a pathway with category + cpd_hours and lists published only', async () => {
    const db = await import('@/lib/db');
    const a = await db.createPathway({ title: 'Gut Health Basics', category: 'Gut Health', cpdHours: 3, published: true });
    await db.createPathway({ title: 'Draft', category: 'Gut Health', published: false });
    expect(a.cpdHours).toBe(3);
    expect(a.category).toBe('Gut Health');
    const published = await db.listPublishedPathways();
    expect(published.map((p) => p.title)).toEqual(['Gut Health Basics']);
    expect((await db.listPathways())).toHaveLength(2);
  });

  it('progress: required-only, lesson-completion union, 100% => complete', async () => {
    const db = await import('@/lib/db');
    const p = await seedPractitioner();
    const lessonA = await seedLesson('Lesson A');
    const lessonB = await seedLesson('Lesson B');
    const pathway = await db.createPathway({ title: 'Path', category: 'Gut Health', cpdHours: 2, published: true });
    const m1 = await db.addPathwayModule(pathway.id, { title: 'M1', contentKind: 'lesson', contentId: lessonA, position: 0, required: true });
    const m2 = await db.addPathwayModule(pathway.id, { title: 'M2', contentKind: 'lesson', contentId: lessonB, position: 1, required: true });
    await db.addPathwayModule(pathway.id, { title: 'Optional', contentKind: 'lesson', contentId: lessonA, position: 2, required: false });

    let prog = await db.pathwayProgress(p.id, pathway.id);
    expect(prog.required).toBe(2);
    expect(prog.percent).toBe(0);
    expect(prog.complete).toBe(false);

    // Complete m1 explicitly; complete lessonB (library) which should auto-complete m2.
    await db.markModuleComplete(p.id, m1.id);
    await db.toggleCompletion(p.id, lessonB);
    prog = await db.pathwayProgress(p.id, pathway.id);
    expect(prog.completedRequired).toBe(2);
    expect(prog.percent).toBe(100);
    expect(prog.complete).toBe(true);
    expect(prog.completedModuleIds).toContain(m2.id);
  });

  it('markModuleComplete is idempotent', async () => {
    const db = await import('@/lib/db');
    const p = await seedPractitioner();
    const lesson = await seedLesson('L');
    const pathway = await db.createPathway({ title: 'P', published: true });
    const m = await db.addPathwayModule(pathway.id, { title: 'M', contentKind: 'lesson', contentId: lesson, required: true });
    await db.markModuleComplete(p.id, m.id);
    await db.markModuleComplete(p.id, m.id);
    expect(await db.moduleCompletionIds(p.id)).toEqual([m.id]);
  });

  it('issueCertificate is idempotent per (practitioner, pathway)', async () => {
    const db = await import('@/lib/db');
    const p = await seedPractitioner();
    const pathway = await db.createPathway({ title: 'P', cpdHours: 4, published: true });
    const c1 = await db.issueCertificate(p.id, pathway.id, 'https://blob/cert1.pdf');
    const c2 = await db.issueCertificate(p.id, pathway.id, 'https://blob/cert2.pdf');
    expect(c1.id).toBe(c2.id);
    expect((await db.listCertificates(p.id))).toHaveLength(1);
    expect((await db.getCertificate(p.id, pathway.id))!.pdfUrl).toBe('https://blob/cert1.pdf');
  });
});
