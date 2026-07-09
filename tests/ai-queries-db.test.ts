import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-aiq-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('ai_queries', () => {
  it('records and lists queries with parsed JSON fields, newest first', async () => {
    const { insertApplication, recordAiQuery, listAiQueries } = await import('@/lib/db');
    const p = insertApplication({
      name: 'Jane Smith', email: 'jane@example.com', registerBody: 'BANT',
      registerNumber: '12345', qualificationStatus: 'qualified',
    });
    recordAiQuery({
      practitionerId: p.id,
      profileInput: '35F insomnia',
      status: 'ok',
      safetyFlags: [{ type: 'MEDICATION', detail: 'x' }],
      output: { status: 'ok' },
      groundingWarnings: ['stripped: Elixir'],
      model: 'claude-opus-4-8',
      inputTokens: 100,
      outputTokens: 50,
    });
    recordAiQuery({
      practitionerId: p.id,
      profileInput: 'broken one',
      status: 'error',
      safetyFlags: [],
    });
    const rows = listAiQueries();
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe('error'); // newest first
    expect(rows[1].safetyFlags).toEqual([{ type: 'MEDICATION', detail: 'x' }]);
    expect(rows[1].groundingWarnings).toEqual(['stripped: Elixir']);
    expect(rows[1].output).toEqual({ status: 'ok' });
    expect(rows[1].practitionerName).toBe('Jane Smith');
    expect(rows[1].inputTokens).toBe(100);
  });
});
