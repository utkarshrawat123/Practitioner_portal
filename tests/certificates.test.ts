import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const put = vi.fn(async () => ({ url: 'https://blob.example/cert.pdf' }));
vi.mock('@vercel/blob', () => ({ put: (...a: unknown[]) => put(...a) }));

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-cert-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  put.mockClear();
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seed() {
  const db = await import('@/lib/db');
  const p = await db.insertApplication({ name: 'Jane Smith', email: 'j@example.com', registerBody: 'BANT', registerNumber: '1', qualificationStatus: 'qualified' });
  await db.markApproved(p.id, { affiliateCode: 'WN-X-1', affiliateLink: 'x', pendingSync: false, decidedBy: 'system' });
  const lid = await db.insertLesson({ sourceFile: 's', title: 'L', summary: 'x', takeaways: [], quiz: { questions: [] } as never, topics: [], claimFlags: [] });
  await db.setLessonStatus(lid, 'published');
  const pathway = await db.createPathway({ title: 'Gut Health', cpdHours: 3, published: true });
  const m = await db.addPathwayModule(pathway.id, { title: 'M', contentKind: 'lesson', contentId: lid, required: true });
  return { db, practitioner: p, pathway, moduleId: m.id };
}

describe('certificate PDF', () => {
  it('generates non-empty PDF bytes starting with %PDF', async () => {
    const { generateCertificatePdf } = await import('@/lib/certificates');
    const bytes = await generateCertificatePdf({ name: 'Jane Smith', pathwayTitle: 'Gut Health', cpdHours: 3, date: '16 July 2026' });
    expect(bytes.length).toBeGreaterThan(500);
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe('%PDF');
  });
});

describe('maybeIssueCertificate', () => {
  it('returns null when the pathway is not complete', async () => {
    const { practitioner, pathway } = await seed();
    const { maybeIssueCertificate } = await import('@/lib/certificates');
    expect(await maybeIssueCertificate(practitioner.id, practitioner.name, pathway)).toBeNull();
    expect(put).not.toHaveBeenCalled();
  });

  it('issues once on completion and is idempotent (no second upload)', async () => {
    const { db, practitioner, pathway, moduleId } = await seed();
    await db.markModuleComplete(practitioner.id, moduleId);
    const { maybeIssueCertificate } = await import('@/lib/certificates');
    const c1 = await maybeIssueCertificate(practitioner.id, practitioner.name, pathway);
    expect(c1).not.toBeNull();
    expect(c1!.pdfUrl).toBe('https://blob.example/cert.pdf');
    expect(put).toHaveBeenCalledTimes(1);
    const c2 = await maybeIssueCertificate(practitioner.id, practitioner.name, pathway);
    expect(c2!.id).toBe(c1!.id);
    expect(put).toHaveBeenCalledTimes(1); // not re-uploaded
  });
});
