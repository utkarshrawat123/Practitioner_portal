import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const put = vi.fn(async () => ({ url: 'https://blob.example/cert.pdf' }));
vi.mock('@vercel/blob', () => ({ put: (...a: unknown[]) => put(...a) }));

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-apipath-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  put.mockClear();
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved(qualificationStatus: 'qualified' | 'student' = 'qualified') {
  const db = await import('@/lib/db');
  const p = await db.insertApplication({ name: 'Jane Smith', email: `${qualificationStatus}@example.com`, registerBody: 'BANT', registerNumber: '1', qualificationStatus });
  return db.markApproved(p.id, { affiliateCode: 'WN-X-1', affiliateLink: 'x', pendingSync: false, decidedBy: 'system' });
}
async function cookie(id: number): Promise<string> {
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return sessionCookieHeader(id).split(';')[0];
}
async function pubLesson(title: string) {
  const db = await import('@/lib/db');
  const id = await db.insertLesson({ sourceFile: 's', title, summary: 'x', takeaways: [], quiz: { questions: [] } as never, topics: [], claimFlags: [] });
  await db.setLessonStatus(id, 'published');
  return id;
}

describe('GET /api/me/pathways', () => {
  it('401 without session; audience-filters and attaches progress', async () => {
    const db = await import('@/lib/db');
    const { GET } = await import('@/app/api/me/pathways/route');
    expect((await GET(new Request('http://x/'))).status).toBe(401);

    const p = await seedApproved('student');
    await db.createPathway({ title: 'Everyone', category: 'Gut Health', published: true, audience: 'all' });
    await db.createPathway({ title: 'Qualified only', category: 'Gut Health', published: true, audience: 'qualified' });
    await db.createPathway({ title: 'Unpublished', published: false });
    const res = await GET(new Request('http://x/', { headers: { cookie: await cookie(p.id) } }));
    const body = await res.json();
    expect(body.pathways.map((x: { title: string }) => x.title)).toEqual(['Everyone']);
    expect(body.pathways[0].progress.percent).toBe(0);
  });
});

describe('POST complete → certificate on 100%', () => {
  it('marks module complete and issues a certificate when required modules done', async () => {
    const db = await import('@/lib/db');
    const p = await seedApproved('qualified');
    const lid = await pubLesson('L1');
    const pathway = await db.createPathway({ title: 'Gut Health', category: 'Gut Health', cpdHours: 3, published: true });
    const m = await db.addPathwayModule(pathway.id, { title: 'M1', contentKind: 'lesson', contentId: lid, required: true });

    const { POST } = await import('@/app/api/me/pathways/[id]/complete/route');
    const res = await POST(
      new Request('http://x/', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: await cookie(p.id) }, body: JSON.stringify({ moduleId: m.id }) }),
      { params: { id: String(pathway.id) } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.progress.complete).toBe(true);
    expect(body.certificate.pdfUrl).toBe('https://blob.example/cert.pdf');
    expect(put).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/me/cpd', () => {
  it('lists earned certificates and per-pathway progress', async () => {
    const db = await import('@/lib/db');
    const p = await seedApproved('qualified');
    const pathway = await db.createPathway({ title: 'Gut Health', category: 'Gut Health', cpdHours: 3, published: true });
    await db.issueCertificate(p.id, pathway.id, 'https://blob.example/c.pdf');
    const { GET } = await import('@/app/api/me/cpd/route');
    const res = await GET(new Request('http://x/', { headers: { cookie: await cookie(p.id) } }));
    const body = await res.json();
    expect(body.certificates).toHaveLength(1);
    expect(body.certificates[0].pathwayTitle).toBe('Gut Health');
    expect(body.progress).toHaveLength(1);
  });
});
