import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-aiapi-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.KB_DIR = path.join(__dirname, 'fixtures', 'kb');
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY2;
  (await import('@/lib/ai/kb')).clearKbCacheForTests();
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.KB_DIR;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY2;
  delete process.env.GEMINI_MODEL;
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

async function sessionHeaders(id: number): Promise<Record<string, string>> {
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return { cookie: sessionCookieHeader(id).split(';')[0], 'Content-Type': 'application/json' };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://x/api/assistant', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}

const modelOutput = {
  status: 'ok',
  out_of_scope_reason: '',
  safety_flags: [],
  protocol: [{
    product: 'WN Magnesium (Food-Grown®)', dose: '2 capsules daily with food',
    rationale: 'Sleep support', evidence_notes: 'Psych function claim',
    sources: ['WN Magnesium (Food-Grown®)', 'Dosing Principles'],
  }],
  sources_reviewed: ['WN Magnesium (Food-Grown®)', 'Dosing Principles', 'Contraindication & Referral Guide'],
  general_notes: 'Review in 8 weeks.',
  handout: { intro: 'Hi', explanation: 'Take with food', lifestyle_notes: 'Sleep hygiene' },
};

function stubAnthropicFetch() {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-4-8',
      content: [{ type: 'text', text: JSON.stringify(modelOutput) }],
      stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 500, output_tokens: 200 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  ));
}

function stubGeminiFetch() {
  const spy = vi.fn(async () =>
    new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(modelOutput) }] } }],
      usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 150 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('POST /api/assistant', () => {
  it('401s without a session', async () => {
    const { POST } = await import('@/app/api/assistant/route');
    const res = await POST(post({ profile: 'a profile long enough' }));
    expect(res.status).toBe(401);
  });

  it('503s when the API key is not configured', async () => {
    const p = await seedApproved();
    const { POST } = await import('@/app/api/assistant/route');
    const res = await POST(post({ profile: '35F, insomnia, vegetarian' }, await sessionHeaders(p.id)));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('not_configured');
  });

  it('generates, grounds, logs and renders a handout with the practitioner code', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    stubAnthropicFetch();
    const p = await seedApproved();
    const { POST } = await import('@/app/api/assistant/route');
    const res = await POST(
      post({ profile: '35F, perimenopausal, low ferritin, insomnia, vegetarian' }, await sessionHeaders(p.id))
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.output.status).toBe('ok');
    expect(body.output.protocol).toHaveLength(1);
    expect(body.handoutHtml).toContain('WN-SMITH-AB2C');
    expect(body.handoutHtml).toContain('Jane Smith');
    const { listAiQueries } = await import('@/lib/db');
    const rows = await listAiQueries();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('ok');
    expect(rows[0].inputTokens).toBe(500);
  });

  it('uses Gemini (Ask Lorna) when GEMINI_API_KEY is set, logging the Gemini model', async () => {
    process.env.GEMINI_API_KEY = 'gm-test';
    process.env.GEMINI_MODEL = 'gemini-2.0-flash';
    const spy = stubGeminiFetch();
    const p = await seedApproved();
    const { POST } = await import('@/app/api/assistant/route');
    const res = await POST(
      post({ profile: '42F, low energy, vegetarian, no medications' }, await sessionHeaders(p.id))
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.output.status).toBe('ok');
    // The request went to Google's endpoint, not Anthropic's.
    expect(String(spy.mock.calls[0][0])).toContain('generativelanguage.googleapis.com');
    const { listAiQueries } = await import('@/lib/db');
    const rows = await listAiQueries();
    expect(rows[0].model).toBe('gemini-2.0-flash');
    expect(rows[0].inputTokens).toBe(700);
  });

  it('falls back to GEMINI_API_KEY2 when the primary key is quota-exhausted (429)', async () => {
    process.env.GEMINI_API_KEY = 'gm-primary';
    process.env.GEMINI_API_KEY2 = 'gm-secondary';
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).includes('gm-primary')) {
        return new Response(JSON.stringify({ error: { code: 429, message: 'quota' } }), { status: 429 });
      }
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(modelOutput) }] } }],
        usageMetadata: { promptTokenCount: 400, candidatesTokenCount: 100 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const p = await seedApproved();
    const { POST } = await import('@/app/api/assistant/route');
    const res = await POST(post({ profile: '55F, joint aches, no meds, not pregnant' }, await sessionHeaders(p.id)));
    expect(res.status).toBe(200);
    expect((await res.json()).output.status).toBe('ok');
    // Primary key tried first, then fell back to the secondary key.
    expect(calls[0]).toContain('gm-primary');
    expect(calls[1]).toContain('gm-secondary');
  });

  it('rejects too-short profiles', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const p = await seedApproved();
    const { POST } = await import('@/app/api/assistant/route');
    const res = await POST(post({ profile: 'hi' }, await sessionHeaders(p.id)));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/ai-queries', () => {
  it('is admin-gated and returns logged queries', async () => {
    process.env.ADMIN_PASSWORD = 'secret-pass';
    const p = await seedApproved();
    const { recordAiQuery } = await import('@/lib/db');
    recordAiQuery({ practitionerId: p.id, profileInput: 'x profile', status: 'ok', safetyFlags: [] });
    const { GET } = await import('@/app/api/admin/ai-queries/route');
    expect((await GET(new Request('http://x/'))).status).toBe(401);
    const { adminToken } = await import('@/lib/adminAuth');
    const res = await GET(new Request('http://x/', { headers: { cookie: `wn_admin=${adminToken()}` } }));
    expect(res.status).toBe(200);
    expect((await res.json()).queries).toHaveLength(1);
  });
});
