import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-chat-db-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved(email = 'p1@example.com', name = 'Pat One') {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name, email, registerBody: 'BANT', registerNumber: '12345',
    qualificationStatus: 'qualified',
  });
  const code = `WN-${p.id}-AB2C`;
  return markApproved(p.id, {
    affiliateCode: code, affiliateLink: `http://x/r/${code}`,
    pendingSync: false, decidedBy: 'system',
  });
}

describe('chat conversations + messages', () => {
  it('get-or-create returns the same open conversation', async () => {
    const p = await seedApproved();
    const db = await import('@/lib/db');
    const a = await db.getOrCreateOpenConversation(p.id, 'Hi there');
    const b = await db.getOrCreateOpenConversation(p.id);
    expect(a.id).toBe(b.id);
    expect(a.status).toBe('open');
    expect(a.subject).toBe('Hi there');
  });

  it('closing a conversation makes the next get-or-create a fresh one', async () => {
    const p = await seedApproved();
    const db = await import('@/lib/db');
    const a = await db.getOrCreateOpenConversation(p.id);
    await db.setConversationStatus(a.id, 'closed');
    const b = await db.getOrCreateOpenConversation(p.id);
    expect(b.id).not.toBe(a.id);
  });

  it('messages track unread and the sender has read their own message', async () => {
    const p = await seedApproved();
    const db = await import('@/lib/db');
    const c = await db.getOrCreateOpenConversation(p.id);
    const m = await db.addChatMessage({ conversationId: c.id, sender: 'practitioner', body: 'Question?' });
    expect(m.readByPractitioner).toBe(true);
    expect(m.readByAdmin).toBe(false);
    expect(await db.adminUnreadCount()).toBe(1);

    await db.markConversationReadByAdmin(c.id);
    expect(await db.adminUnreadCount()).toBe(0);

    await db.addChatMessage({ conversationId: c.id, sender: 'admin', body: 'Answer!' });
    // Admin reply is unread by the practitioner until they view it.
    const list = await db.listConversationsForAdmin('open');
    expect(list[0].adminUnread).toBe(0);
    await db.markConversationReadByPractitioner(c.id);
    const msgs = await db.listChatMessages(c.id);
    expect(msgs.every((x) => x.readByPractitioner)).toBe(true);
  });

  it('listChatMessages sinceId only returns newer messages', async () => {
    const p = await seedApproved();
    const db = await import('@/lib/db');
    const c = await db.getOrCreateOpenConversation(p.id);
    const m1 = await db.addChatMessage({ conversationId: c.id, sender: 'practitioner', body: 'one' });
    const m2 = await db.addChatMessage({ conversationId: c.id, sender: 'admin', body: 'two' });
    const since = await db.listChatMessages(c.id, m1.id);
    expect(since.map((x) => x.id)).toEqual([m2.id]);
  });

  it('admin list summarises last message + unread and sorts by activity', async () => {
    const p1 = await seedApproved('a@example.com', 'Alice');
    const p2 = await seedApproved('b@example.com', 'Bob');
    const db = await import('@/lib/db');
    const c1 = await db.getOrCreateOpenConversation(p1.id);
    await db.addChatMessage({ conversationId: c1.id, sender: 'practitioner', body: 'first from alice' });
    const c2 = await db.getOrCreateOpenConversation(p2.id);
    await db.addChatMessage({ conversationId: c2.id, sender: 'practitioner', body: 'latest from bob' });
    const list = await db.listConversationsForAdmin();
    expect(list[0].practitionerName).toBe('Bob'); // most recent activity first
    expect(list[0].lastMessage).toBe('latest from bob');
    expect(list[0].adminUnread).toBe(1);
  });
});

describe('missed-message backstop query', () => {
  it('surfaces conversations awaiting a reply past the threshold, once', async () => {
    const p = await seedApproved();
    const db = await import('@/lib/db');
    const c = await db.getOrCreateOpenConversation(p.id);
    await db.addChatMessage({ conversationId: c.id, sender: 'practitioner', body: 'help please' });
    // Back-date the practitioner message + conversation stamp to 10 min ago.
    await db.execForTests(
      `UPDATE chat_conversations SET last_practitioner_at = datetime('now','-10 minutes'),
         updated_at = datetime('now','-10 minutes') WHERE id = ?`, [c.id]
    );
    const due = await db.conversationsAwaitingAlert(5);
    expect(due.map((x) => x.id)).toContain(c.id);

    await db.markConversationAlerted(c.id);
    expect((await db.conversationsAwaitingAlert(5)).map((x) => x.id)).not.toContain(c.id);
  });

  it('an admin reply re-arms and clears the alert', async () => {
    const p = await seedApproved();
    const db = await import('@/lib/db');
    const c = await db.getOrCreateOpenConversation(p.id);
    await db.addChatMessage({ conversationId: c.id, sender: 'practitioner', body: 'q' });
    await db.markConversationAlerted(c.id);
    await db.addChatMessage({ conversationId: c.id, sender: 'admin', body: 'a' });
    const after = await db.getConversation(c.id);
    expect(after!.alertedAt).toBeNull(); // cleared by the reply
    // Not awaiting alert now (admin replied last).
    expect((await db.conversationsAwaitingAlert(0)).map((x) => x.id)).not.toContain(c.id);
  });
});

describe('chatStats', () => {
  it('counts messages, conversations and top practitioners', async () => {
    const p1 = await seedApproved('a@example.com', 'Alice');
    const p2 = await seedApproved('b@example.com', 'Bob');
    const db = await import('@/lib/db');
    const c1 = await db.getOrCreateOpenConversation(p1.id);
    await db.addChatMessage({ conversationId: c1.id, sender: 'practitioner', body: 'q1' });
    await db.addChatMessage({ conversationId: c1.id, sender: 'practitioner', body: 'q2' });
    await db.addChatMessage({ conversationId: c1.id, sender: 'admin', body: 'a1' });
    const c2 = await db.getOrCreateOpenConversation(p2.id);
    await db.addChatMessage({ conversationId: c2.id, sender: 'practitioner', body: 'q3' });

    const s = await db.chatStats();
    expect(s.totalMessages).toBe(4);
    expect(s.totalConversations).toBe(2);
    expect(s.practitionerMessages).toBe(3);
    expect(s.adminMessages).toBe(1);
    expect(s.uniquePractitioners).toBe(2);
    expect(s.topPractitioners[0]).toMatchObject({ name: 'Alice', messages: 2 });
    expect(s.byMonth.reduce((n, m) => n + m.messages, 0)).toBe(4);
  });
});
