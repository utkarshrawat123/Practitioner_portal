import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-chat-api-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'test-admin-pw';
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved(email = 'p@example.com', name = 'Pat One') {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name, email, registerBody: 'BANT', registerNumber: '12345', qualificationStatus: 'qualified',
  });
  const code = `WN-${p.id}-AB2C`;
  await markApproved(p.id, {
    affiliateCode: code, affiliateLink: `http://x/r/${code}`, pendingSync: false, decidedBy: 'system',
  });
  return p;
}
async function pHeaders(id: number) {
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return { cookie: sessionCookieHeader(id).split(';')[0], 'Content-Type': 'application/json' };
}
async function adminHeaders() {
  const { adminToken } = await import('@/lib/adminAuth');
  return { cookie: `wn_admin=${adminToken()}`, 'Content-Type': 'application/json' };
}

describe('practitioner chat API', () => {
  it('401 without a session', async () => {
    const { GET, POST } = await import('@/app/api/me/chat/route');
    expect((await GET(new Request('http://x/api/me/chat'))).status).toBe(401);
    expect((await POST(new Request('http://x/api/me/chat', { method: 'POST', body: '{}' }))).status).toBe(401);
  });

  it('POST creates a conversation + message; GET returns the thread', async () => {
    const p = await seedApproved();
    const headers = await pHeaders(p.id);
    const { GET, POST } = await import('@/app/api/me/chat/route');
    const post = await POST(new Request('http://x/api/me/chat', {
      method: 'POST', headers, body: JSON.stringify({ body: 'How do I dose magnesium?' }),
    }));
    expect(post.status).toBe(201);
    const posted = await post.json();
    expect(posted.conversationId).toBeGreaterThan(0);

    const get = await GET(new Request('http://x/api/me/chat', { headers }));
    const body = await get.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].body).toBe('How do I dose magnesium?');
    expect(body.messages[0].sender).toBe('practitioner');
  });

  it('rejects an empty message body with 400', async () => {
    const p = await seedApproved();
    const headers = await pHeaders(p.id);
    const { POST } = await import('@/app/api/me/chat/route');
    const res = await POST(new Request('http://x/api/me/chat', {
      method: 'POST', headers, body: JSON.stringify({ body: '   ' }),
    }));
    expect(res.status).toBe(400);
  });
});

describe('admin chat API', () => {
  it('401 without admin auth', async () => {
    const list = await import('@/app/api/admin/chat/route');
    expect((await list.GET(new Request('http://x/api/admin/chat'))).status).toBe(401);
  });

  it('lists conversations, replies, and reply flows back to the practitioner', async () => {
    const p = await seedApproved();
    const ph = await pHeaders(p.id);
    const ah = await adminHeaders();

    // Practitioner opens a chat.
    const meRoute = await import('@/app/api/me/chat/route');
    await meRoute.POST(new Request('http://x/api/me/chat', {
      method: 'POST', headers: ph, body: JSON.stringify({ body: 'Need help' }),
    }));

    // Admin sees it with an unread count.
    const listRoute = await import('@/app/api/admin/chat/route');
    const listRes = await listRoute.GET(new Request('http://x/api/admin/chat', { headers: ah }));
    const listBody = await listRes.json();
    expect(listBody.unread).toBe(1);
    expect(listBody.conversations).toHaveLength(1);
    const convoId = listBody.conversations[0].id;

    // Admin opens the thread → unread clears.
    const threadRoute = await import('@/app/api/admin/chat/[id]/route');
    await threadRoute.GET(new Request(`http://x/api/admin/chat/${convoId}`, { headers: ah }), { params: { id: String(convoId) } });
    const afterRead = await (await listRoute.GET(new Request('http://x/api/admin/chat', { headers: ah }))).json();
    expect(afterRead.unread).toBe(0);

    // Admin replies.
    const reply = await threadRoute.POST(new Request(`http://x/api/admin/chat/${convoId}`, {
      method: 'POST', headers: ah, body: JSON.stringify({ body: 'Happy to help!' }),
    }), { params: { id: String(convoId) } });
    expect(reply.status).toBe(201);

    // Practitioner sees the reply.
    const meGet = await meRoute.GET(new Request('http://x/api/me/chat', { headers: ph }));
    const meBody = await meGet.json();
    expect(meBody.messages.map((m: { body: string }) => m.body)).toContain('Happy to help!');
  });

  it('close toggles conversation status', async () => {
    const p = await seedApproved();
    const ph = await pHeaders(p.id);
    const ah = await adminHeaders();
    const meRoute = await import('@/app/api/me/chat/route');
    const posted = await (await meRoute.POST(new Request('http://x/api/me/chat', {
      method: 'POST', headers: ph, body: JSON.stringify({ body: 'hi' }),
    }))).json();
    const closeRoute = await import('@/app/api/admin/chat/[id]/close/route');
    const res = await closeRoute.POST(new Request(`http://x/api/admin/chat/${posted.conversationId}/close`, {
      method: 'POST', headers: ah, body: JSON.stringify({ status: 'closed' }),
    }), { params: { id: String(posted.conversationId) } });
    expect((await res.json()).conversation.status).toBe('closed');
  });

  it('POST /api/admin/chat starts (and reuses) an open conversation for a practitioner', async () => {
    const p = await seedApproved('start@example.com', 'Start Target');
    const { POST } = await import('@/app/api/admin/chat/route');
    const headers = await adminHeaders();
    const mk = () => new Request('http://x/api/admin/chat', {
      method: 'POST', headers, body: JSON.stringify({ practitionerId: p.id }),
    });
    const first = await POST(mk());
    expect(first.status).toBe(201);
    const a = await first.json();
    expect(a.conversationId).toBeGreaterThan(0);
    const second = await POST(mk());
    const b = await second.json();
    expect(b.conversationId).toBe(a.conversationId); // idempotent get-or-create
  });

  it('POST /api/admin/chat 401 without admin auth', async () => {
    const { POST } = await import('@/app/api/admin/chat/route');
    const res = await POST(new Request('http://x/api/admin/chat', {
      method: 'POST', body: JSON.stringify({ practitionerId: 1 }),
    }));
    expect(res.status).toBe(401);
  });
});

describe('chat insights API', () => {
  it('401 without admin auth; returns stats + keywords when authed', async () => {
    const p = await seedApproved();
    const ph = await pHeaders(p.id);
    const ah = await adminHeaders();
    const meRoute = await import('@/app/api/me/chat/route');
    await meRoute.POST(new Request('http://x/api/me/chat', {
      method: 'POST', headers: ph, body: JSON.stringify({ body: 'How much magnesium for sleep?' }),
    }));

    const { GET } = await import('@/app/api/admin/chat/insights/route');
    expect((await GET(new Request('http://x/api/admin/chat/insights'))).status).toBe(401);

    const res = await GET(new Request('http://x/api/admin/chat/insights', { headers: ah }));
    const body = await res.json();
    expect(body.stats.practitionerMessages).toBe(1);
    expect(body.keywords.map((k: { term: string }) => k.term)).toContain('magnesium');
  });

  it('CSV export streams practitioner messages', async () => {
    const p = await seedApproved();
    const ph = await pHeaders(p.id);
    const ah = await adminHeaders();
    const meRoute = await import('@/app/api/me/chat/route');
    await meRoute.POST(new Request('http://x/api/me/chat', {
      method: 'POST', headers: ph, body: JSON.stringify({ body: 'vegan iron question' }),
    }));
    const { GET } = await import('@/app/api/admin/chat/insights/route');
    const res = await GET(new Request('http://x/api/admin/chat/insights?export=csv', { headers: ah }));
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(await res.text()).toContain('vegan iron question');
  });

  it('FAQ endpoint degrades gracefully when AI is unavailable', async () => {
    // No GEMINI key configured in tests → generateFaqConsolidation throws → aiAvailable:false.
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY2;
    const p = await seedApproved();
    const ph = await pHeaders(p.id);
    const ah = await adminHeaders();
    const meRoute = await import('@/app/api/me/chat/route');
    await meRoute.POST(new Request('http://x/api/me/chat', {
      method: 'POST', headers: ph, body: JSON.stringify({ body: 'a real question' }),
    }));
    const { POST } = await import('@/app/api/admin/chat/insights/faqs/route');
    const res = await POST(new Request('http://x/api/admin/chat/insights/faqs', {
      method: 'POST', headers: ah, body: JSON.stringify({}),
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.aiAvailable).toBe(false);
    expect(body.faqs).toEqual([]);
  });
});

describe('missed-message alert cron', () => {
  it('rejects without the CRON_SECRET when set', async () => {
    process.env.CRON_SECRET = 'sekret';
    const { GET } = await import('@/app/api/cron/chat-alerts/route');
    const res = await GET(new Request('http://x/api/cron/chat-alerts'));
    expect(res.status).toBe(401);
    delete process.env.CRON_SECRET;
  });

  it('alerts a waiting conversation once (SMTP unconfigured → no-op send, still marked)', async () => {
    delete process.env.GMAIL_USER; // ensure smtp unconfigured
    const p = await seedApproved();
    const db = await import('@/lib/db');
    const c = await db.getOrCreateOpenConversation(p.id);
    await db.addChatMessage({ conversationId: c.id, sender: 'practitioner', body: 'waiting' });
    await db.execForTests(
      `UPDATE chat_conversations SET last_practitioner_at = datetime('now','-10 minutes'),
         updated_at = datetime('now','-10 minutes') WHERE id = ?`, [c.id]
    );
    const { GET } = await import('@/app/api/cron/chat-alerts/route');
    const first = await (await GET(new Request('http://x/api/cron/chat-alerts'))).json();
    expect(first.alerted).toBe(1);
    const second = await (await GET(new Request('http://x/api/cron/chat-alerts'))).json();
    expect(second.alerted).toBe(0); // already alerted
  });
});
