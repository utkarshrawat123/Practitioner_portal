import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isWorkersRuntime } from '@/lib/db/binding';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-guard-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  vi.unstubAllGlobals();
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('isWorkersRuntime', () => {
  it('is false under Node/Vitest', () => {
    expect(isWorkersRuntime()).toBe(false);
  });

  it('is true when the runtime identifies itself as Cloudflare-Workers', () => {
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' });
    expect(isWorkersRuntime()).toBe(true);
  });
});

describe('database client selection on Workers', () => {
  it('fails loudly when running on Workers with no D1 binding', async () => {
    // The real go-live footgun: a mistyped/missing database_id in wrangler.toml
    // leaves getD1Binding() null, and the old code fell through to a local
    // `file:` path — meaningless on Workers (no filesystem), and previously
    // guarded only by a dead `process.env.VERCEL` check.
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' });
    const db = await import('@/lib/db');
    db.resetDbForTests();
    await expect(db.getPractitioner(1)).rejects.toThrow(/D1 binding/i);
  });

  it('still uses the local file DB under Node even with DB_PATH set', async () => {
    const db = await import('@/lib/db');
    db.resetDbForTests();
    // Proves the guard is Workers-scoped and does not break dev/tests.
    await expect(db.getPractitioner(1)).resolves.toBeNull();
  });
});
