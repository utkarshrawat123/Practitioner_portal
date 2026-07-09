import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-adminles-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'secret-pass';
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function seedDraft() {
  const { insertLesson } = await import('@/lib/db');
  return insertLesson({
    sourceFile: 'talk.md', title: 'Draft title', summary: 'draft summary',
    takeaways: ['a', 'b', 'c'],
    quiz: { question: 'q', options: ['x', 'y'], correctIndex: 0, explanation: 'e' },
    topics: ['sleep'], claimFlags: ['check this claim'],
  });
}

async function adminHeaders(): Promise<Record<string, string>> {
  const { adminToken } = await import('@/lib/adminAuth');
  return { cookie: `wn_admin=${adminToken()}`, 'Content-Type': 'application/json' };
}

describe('admin lessons list', () => {
  it('is admin-gated and returns lessons', async () => {
    const id = await seedDraft();
    const { GET } = await import('@/app/api/admin/lessons/route');
    expect((await GET(new Request('http://x/api/admin/lessons'))).status).toBe(401);
    const res = await GET(new Request('http://x/api/admin/lessons', { headers: await adminHeaders() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lessons.map((l: any) => l.id)).toEqual([id]);
    expect(body.lessons[0].claimFlags).toEqual(['check this claim']);
  });
});

describe('admin lesson actions', () => {
  it('saves edits, approves, rejects, and validates', async () => {
    const id = await seedDraft();
    const { POST } = await import('@/app/api/admin/lessons/[id]/route');
    const headers = await adminHeaders();

    const save = await POST(
      new Request(`http://x/api/admin/lessons/${id}`, {
        method: 'POST', headers,
        body: JSON.stringify({
          action: 'save',
          fields: {
            title: 'Edited title', summary: 'edited', takeaways: ['1', '2', '3'],
            quiz: { question: 'q2', options: ['a', 'b'], correctIndex: 1, explanation: 'e2' },
            topics: ['hormones'],
          },
        }),
      }),
      { params: { id: String(id) } }
    );
    expect(save.status).toBe(200);
    expect((await save.json()).lesson.title).toBe('Edited title');

    const approve = await POST(
      new Request(`http://x/api/admin/lessons/${id}`, {
        method: 'POST', headers, body: JSON.stringify({ action: 'approve' }),
      }),
      { params: { id: String(id) } }
    );
    expect((await approve.json()).lesson.status).toBe('published');

    const id2 = await seedDraft();
    const reject = await POST(
      new Request(`http://x/api/admin/lessons/${id2}`, {
        method: 'POST', headers, body: JSON.stringify({ action: 'reject' }),
      }),
      { params: { id: String(id2) } }
    );
    expect((await reject.json()).lesson.status).toBe('rejected');
  });

  it('401s unauthed, 404s unknown id, 400s unknown action', async () => {
    const { POST } = await import('@/app/api/admin/lessons/[id]/route');
    const id = await seedDraft();
    const unauth = await POST(
      new Request(`http://x/api/admin/lessons/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      }),
      { params: { id: String(id) } }
    );
    expect(unauth.status).toBe(401);
    const headers = await adminHeaders();
    const missing = await POST(
      new Request('http://x/api/admin/lessons/9999', {
        method: 'POST', headers, body: JSON.stringify({ action: 'approve' }),
      }),
      { params: { id: '9999' } }
    );
    expect(missing.status).toBe(404);
    const bad = await POST(
      new Request(`http://x/api/admin/lessons/${id}`, {
        method: 'POST', headers, body: JSON.stringify({ action: 'explode' }),
      }),
      { params: { id: String(id) } }
    );
    expect(bad.status).toBe(400);
  });
});
