import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-mig-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function tableNames(): Promise<string[]> {
  const { execForTests } = await import('@/lib/db');
  const res = await execForTests("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  return res.rows.map((r) => r.name as string);
}

describe('migrations', () => {
  it('creates every Part 1 table on first connection', async () => {
    const names = await tableNames();
    for (const t of [
      'orders',
      'pathways',
      'pathway_modules',
      'certificates',
      'toolkit_resources',
      'hub_events',
      'hub_event_registrations',
      'tier_history',
      'leaderboard_optins',
      'homepage_widgets',
      'schema_migrations',
    ]) {
      expect(names, `missing table: ${t}`).toContain(t);
    }
  });

  it('does not clobber the existing events audit table', async () => {
    // `events` is the practitioner audit trail; the events hub uses hub_events.
    const { execForTests } = await import('@/lib/db');
    const cols = await execForTests('PRAGMA table_info(events)');
    const names = cols.rows.map((r) => r.name as string);
    expect(names).toContain('practitioner_id');
    expect(names).toContain('detail');
    expect(names).not.toContain('starts_at');
  });

  it('records every migration and is idempotent (re-running adds nothing)', async () => {
    const { createClient } = await import('@libsql/client');
    const { runMigrations, MIGRATIONS } = await import('@/lib/migrations');
    const { SCHEMA } = await import('@/lib/db');
    const c = createClient({ url: `file:${process.env.DB_PATH}` });
    // Mirror production: base schema first (so ALTER-based migrations have their
    // target tables), then migrations.
    await c.executeMultiple(SCHEMA);
    await runMigrations(c);
    const after1 = (await c.execute('SELECT id FROM schema_migrations')).rows.map((r) => r.id as string);
    expect(after1.sort()).toEqual(MIGRATIONS.map((m) => m.id).sort());
    // Second run must be a no-op — same recorded set, no errors.
    await runMigrations(c);
    const after2 = (await c.execute('SELECT id FROM schema_migrations')).rows.map((r) => r.id as string);
    expect(after2.sort()).toEqual(after1.sort());
    c.close();
  });

  it('011 adds email_log + automation_runs tables', async () => {
    const { execForTests } = await import('@/lib/db');
    const tables = (await execForTests("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((r) => r.name as string);
    expect(tables).toContain('email_log');
    expect(tables).toContain('automation_runs');
  });

  it('010 adds event_type/capacity + community tables', async () => {
    const { execForTests } = await import('@/lib/db');
    const ecols = (await execForTests('PRAGMA table_info(hub_events)')).rows.map((r) => r.name as string);
    expect(ecols).toContain('event_type');
    expect(ecols).toContain('capacity');
    const tables = (await execForTests("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((r) => r.name as string);
    for (const t of ['community_posts', 'community_replies', 'community_upvotes']) expect(tables).toContain(t);
  });

  it('009 adds pathway category + cpd_hours and module_completions table', async () => {
    const { execForTests } = await import('@/lib/db');
    const cols = (await execForTests('PRAGMA table_info(pathways)')).rows.map((r) => r.name as string);
    expect(cols).toContain('category');
    expect(cols).toContain('cpd_hours');
    const tables = (await execForTests("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((r) => r.name as string);
    expect(tables).toContain('module_completions');
  });

  it('008 adds has_seen_welcome and new rows default to 0', async () => {
    const { execForTests, insertApplication } = await import('@/lib/db');
    // Insert AFTER migrations have run (they run on first getClient()), so this
    // row is created post-migration and defaults to 0.
    const p = await insertApplication({
      name: 'Old Row', email: 'old@example.com', registerBody: 'BANT',
      registerNumber: '999', qualificationStatus: 'qualified',
    });
    const cols = await execForTests('PRAGMA table_info(practitioners)');
    expect(cols.rows.map((r) => r.name as string)).toContain('has_seen_welcome');
    const row = await execForTests('SELECT has_seen_welcome FROM practitioners WHERE id = ?', [p.id]);
    expect(Number(row.rows[0].has_seen_welcome)).toBe(0);
  });
});
