import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createD1Client } from '@/lib/db/d1-adapter';

// Minimal in-memory fake of the Cloudflare D1 binding, backed by better-sqlite3,
// exposing the .prepare().bind().all(), .exec() and .batch() surface the adapter
// uses. This lets us unit-test the adapter with no Workers runtime.
function fakeD1() {
  const sqlite = new Database(':memory:');
  const makeStmt = (sql: string, args: unknown[] = []): any => ({
    bind: (...a: unknown[]) => makeStmt(sql, a),
    all: async () => {
      const s = sqlite.prepare(sql);
      if (s.reader) {
        return { results: s.all(...(args as [])), meta: { changes: 0, last_row_id: 0 } };
      }
      const info = s.run(...(args as []));
      return { results: [], meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
    },
    // D1 prepared statements expose run(); executeMultiple uses it per-statement.
    // Unlike D1's line-based exec(), better-sqlite3.prepare() requires exactly one
    // statement — so this fake also guards that executeMultiple splits correctly.
    run: async () => {
      const info = sqlite.prepare(sql).run(...(args as []));
      return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
    },
  });
  return {
    prepare: (sql: string) => makeStmt(sql),
    exec: async (sql: string) => { sqlite.exec(sql); return { count: 0, duration: 0 }; },
    batch: async (stmts: any[]) => Promise.all(stmts.map((s) => s.all())),
  } as any;
}

describe('createD1Client', () => {
  let client: ReturnType<typeof createD1Client>;

  beforeEach(async () => {
    client = createD1Client(fakeD1());
    await client.executeMultiple(
      'CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);'
    );
  });

  it('runs a write and reports lastInsertRowid + rowsAffected', async () => {
    const res = await client.execute({ sql: 'INSERT INTO t (name) VALUES (?)', args: ['alice'] });
    expect(res.rowsAffected).toBe(1);
    expect(res.lastInsertRowid).toBe(1);
  });

  it('reads rows back as column-keyed objects', async () => {
    await client.execute({ sql: 'INSERT INTO t (name) VALUES (?)', args: ['bob'] });
    const res = await client.execute({ sql: 'SELECT id, name FROM t ORDER BY id' });
    expect(res.rows).toEqual([{ id: 1, name: 'bob' }]);
  });

  it('accepts a bare SQL string for execute', async () => {
    await client.execute("INSERT INTO t (name) VALUES ('carol')");
    const res = await client.execute('SELECT COUNT(*) AS n FROM t');
    expect(res.rows[0].n).toBe(1);
  });

  it('executeMultiple runs multi-line CREATE TABLE + multiple statements', async () => {
    // Regression for D1's line-based exec(): a multi-line CREATE TABLE followed
    // by an index must both apply. prepare() requires one statement each, so this
    // fails unless executeMultiple splits on ';' correctly.
    const c = createD1Client(fakeD1());
    await c.executeMultiple(`
      CREATE TABLE IF NOT EXISTS people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_people_name ON people(name);
    `);
    await c.execute({ sql: 'INSERT INTO people (name) VALUES (?)', args: ['zoe'] });
    const res = await c.execute('SELECT name FROM people');
    expect(res.rows).toEqual([{ name: 'zoe' }]);
  });

  it('runs a batch of parameterised statements', async () => {
    await client.batch([
      { sql: 'INSERT INTO t (name) VALUES (?)', args: ['x'] },
      { sql: 'INSERT INTO t (name) VALUES (?)', args: ['y'] },
    ]);
    const res = await client.execute('SELECT COUNT(*) AS n FROM t');
    expect(res.rows[0].n).toBe(2);
  });
});
