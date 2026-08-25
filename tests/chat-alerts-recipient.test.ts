import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-alerts-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  saved = {
    ADMIN_ALERT_EMAIL: process.env.ADMIN_ALERT_EMAIL,
    SUPPORT_EMAIL: process.env.SUPPORT_EMAIL,
  };
  delete process.env.ADMIN_ALERT_EMAIL;
  delete process.env.SUPPORT_EMAIL;
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('alertRecipient', () => {
  it('is null when neither ADMIN_ALERT_EMAIL nor SUPPORT_EMAIL is set', async () => {
    const { alertRecipient } = await import('@/lib/chat/alerts');
    expect(alertRecipient()).toBeNull();
  });

  it('falls back to the support address', async () => {
    process.env.SUPPORT_EMAIL = 'practitioners@example.org';
    const { alertRecipient } = await import('@/lib/chat/alerts');
    expect(alertRecipient()).toBe('practitioners@example.org');
  });

  it('prefers ADMIN_ALERT_EMAIL over the support address', async () => {
    process.env.SUPPORT_EMAIL = 'practitioners@example.org';
    process.env.ADMIN_ALERT_EMAIL = 'ops@example.org';
    const { alertRecipient } = await import('@/lib/chat/alerts');
    expect(alertRecipient()).toBe('ops@example.org');
  });

  it('never returns a personal gmail address', async () => {
    const { alertRecipient } = await import('@/lib/chat/alerts');
    expect(alertRecipient() ?? '').not.toMatch(/gmail\.com/i);
  });
});

describe('sendChatAlerts with no recipient', () => {
  it('reports skippedNoRecipient instead of emailing', async () => {
    const { sendChatAlerts } = await import('@/lib/chat/alerts');
    const res = await sendChatAlerts();
    expect(res.skippedNoRecipient).toBe(true);
  });
});
