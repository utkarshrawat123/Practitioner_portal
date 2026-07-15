import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-welcome-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('welcome flag', () => {
  it('new practitioner defaults hasSeenWelcome=false, markSeenWelcome flips it', async () => {
    const { insertApplication, getPractitioner, markSeenWelcome } = await import('@/lib/db');
    const p = await insertApplication({
      name: 'Nina New', email: 'nina@example.com', registerBody: 'BANT',
      registerNumber: '111', qualificationStatus: 'student',
    });
    expect(p.hasSeenWelcome).toBe(false);
    await markSeenWelcome(p.id);
    const after = await getPractitioner(p.id);
    expect(after!.hasSeenWelcome).toBe(true);
  });
});
