import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-lib-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  (await import('@/lib/stats')).clearStatsCacheForTests();
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function seedApproved() {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name: 'Jane Smith', email: 'jane@example.com', registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus: 'qualified',
  });
  return markApproved(p.id, {
    affiliateCode: 'WN-SMITH-AB2C', affiliateLink: 'http://localhost:3100/r/WN-SMITH-AB2C',
    pendingSync: false, decidedBy: 'system',
  });
}

async function seedLesson(over: Record<string, unknown> = {}, publish = true) {
  const { insertLesson, setLessonStatus } = await import('@/lib/db');
  const id = await insertLesson({
    sourceFile: 'talk.md', title: 'Sleep science', summary: 'magnesium and sleep',
    takeaways: ['a', 'b', 'c'],
    quiz: { question: 'q', options: ['x', 'y'], correctIndex: 0, explanation: 'e' },
    topics: ['sleep'], claimFlags: [], ...over,
  });
  if (publish) await setLessonStatus(id, "published");
  return id;
}

async function sessionHeaders(id: number): Promise<Record<string, string>> {
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return { cookie: sessionCookieHeader(id).split(';')[0], 'Content-Type': 'application/json' };
}

describe('GET /api/library', () => {
  it('401s without a session', async () => {
    const { GET } = await import('@/app/api/library/route');
    expect((await GET(new Request('http://x/api/library'))).status).toBe(401);
  });

  it('returns only published lessons plus the caller completed set, with filters', async () => {
    const p = await seedApproved();
    const iron = await seedLesson({ title: 'Iron basics', topics: ['iron-deficiency'], summary: 'ferritin' });
    const sleep = await seedLesson({ title: 'Sleep science', topics: ['sleep'], summary: 'magnesium' });
    await seedLesson({ title: 'Draft one' }, false);
    const { toggleCompletion } = await import('@/lib/db');
    toggleCompletion(p.id, sleep);

    const { GET } = await import('@/app/api/library/route');
    const headers = await sessionHeaders(p.id);
    const all = await (await GET(new Request('http://x/api/library', { headers }))).json();
    expect(all.lessons.map((l: any) => l.id).sort()).toEqual([iron, sleep].sort());
    expect(all.completedIds).toEqual([sleep]);
    // published lessons must not leak the claim flags to practitioners
    expect(all.lessons[0].claimFlags).toBeUndefined();

    const byTopic = await (await GET(new Request('http://x/api/library?topic=iron-deficiency', { headers }))).json();
    expect(byTopic.lessons.map((l: any) => l.id)).toEqual([iron]);

    const bySearch = await (await GET(new Request('http://x/api/library?q=magnesium', { headers }))).json();
    expect(bySearch.lessons.map((l: any) => l.id)).toEqual([sleep]);
  });
});

describe('POST /api/library/[id]/complete', () => {
  it('toggles completion and 404s on an unpublished lesson', async () => {
    const p = await seedApproved();
    const pub = await seedLesson();
    const draftId = await seedLesson({ title: 'Draft' }, false);
    const { POST } = await import('@/app/api/library/[id]/complete/route');
    const headers = await sessionHeaders(p.id);

    const on = await POST(new Request('http://x/', { method: 'POST', headers }), { params: { id: String(pub) } });
    expect(on.status).toBe(200);
    expect((await on.json()).completed).toBe(true);

    const off = await POST(new Request('http://x/', { method: 'POST', headers }), { params: { id: String(pub) } });
    expect((await off.json()).completed).toBe(false);

    const bad = await POST(new Request('http://x/', { method: 'POST', headers }), { params: { id: String(draftId) } });
    expect(bad.status).toBe(404);

    const unauth = await POST(new Request('http://x/', { method: 'POST' }), { params: { id: String(pub) } });
    expect(unauth.status).toBe(401);
  });
});

describe('stats include lessonsCompleted', () => {
  it('counts the practitioner completed lessons', async () => {
    const p = await seedApproved();
    const pub = await seedLesson();
    const { toggleCompletion } = await import('@/lib/db');
    toggleCompletion(p.id, pub);
    const { computeStats } = await import('@/lib/stats');
    const s = await computeStats(p, { name: 'fake', async getOrderStats() {
      return { ordersThisMonth: 0, ordersAllTime: 0, revenueThisMonth: 0, revenueAllTime: 0 };
    } });
    expect(s.lessonsCompleted).toBe(1);
  });
});
