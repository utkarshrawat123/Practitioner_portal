import type { D1Database } from '@cloudflare/workers-types';

export interface D1Stmt {
  sql: string;
  args?: unknown[];
}

export interface D1Result {
  rows: Record<string, unknown>[];
  lastInsertRowid?: number;
  rowsAffected: number;
}

/**
 * Wraps a Cloudflare D1 binding in the subset of the libSQL `Client` interface
 * that `lib/db.ts` and `lib/migrations.ts` call — `execute`, `executeMultiple`,
 * `batch`, `close`. This lets every existing query function run unchanged
 * against D1. Both D1 and libSQL are SQLite, so the SQL is portable.
 */
export function createD1Client(db: D1Database) {
  async function execute(stmt: D1Stmt | string): Promise<D1Result> {
    const { sql, args = [] } = typeof stmt === 'string' ? { sql: stmt, args: [] as unknown[] } : stmt;
    const prepared = db.prepare(sql);
    const bound = args.length ? prepared.bind(...(args as unknown[])) : prepared;
    const out: any = await bound.all();
    return {
      rows: (out.results ?? []) as Record<string, unknown>[],
      lastInsertRowid: out.meta?.last_row_id ?? 0,
      rowsAffected: out.meta?.changes ?? 0,
    };
  }

  async function executeMultiple(sql: string): Promise<void> {
    // D1's exec() runs multiple statements; it wants each on its own line.
    await db.exec(sql.replace(/\n\s*\n/g, '\n').trim());
  }

  async function batch(stmts: D1Stmt[]): Promise<void> {
    const prepared = stmts.map((s) =>
      s.args?.length ? db.prepare(s.sql).bind(...(s.args as unknown[])) : db.prepare(s.sql)
    );
    await db.batch(prepared);
  }

  return { execute, executeMultiple, batch, close() {} };
}
