import type { Client } from '@libsql/client';

/**
 * Versioned, idempotent schema migrations.
 *
 * The base `SCHEMA` in db.ts uses CREATE TABLE IF NOT EXISTS, which cannot ADD a
 * column to a table that already exists. This runner lets later work evolve the
 * schema safely: append a new migration with a unique id; it runs exactly once,
 * in order, and is recorded in `schema_migrations`. Never edit or reorder an
 * already-shipped migration — add a new one.
 *
 * Every statement must be non-destructive and idempotent (CREATE TABLE/INDEX IF
 * NOT EXISTS; guarded ALTERs) so a partial failure can be safely retried.
 */
export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    // Shopify orders received via webhook, mapped to a practitioner by discount code.
    id: '001_orders',
    sql: `
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL UNIQUE,
  practitioner_id INTEGER REFERENCES practitioners(id),
  code TEXT NOT NULL,
  total REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  financial_status TEXT,
  created_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_practitioner ON orders(practitioner_id);
CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(code);
`,
  },
  {
    // Structured multi-module learning pathways (Part 3). Modules point at a
    // published lesson or media item; audience gates qualified/student/all.
    id: '002_pathways',
    sql: `
CREATE TABLE IF NOT EXISTS pathways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  audience TEXT NOT NULL DEFAULT 'all',
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pathway_modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pathway_id INTEGER NOT NULL REFERENCES pathways(id),
  title TEXT NOT NULL,
  content_kind TEXT NOT NULL,
  content_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  required INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_pathway_modules_pathway ON pathway_modules(pathway_id);
`,
  },
  {
    // Downloadable CPD certificates issued on pathway completion (Part 3/8).
    id: '003_certificates',
    sql: `
CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  pathway_id INTEGER NOT NULL REFERENCES pathways(id),
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  pdf_url TEXT,
  UNIQUE(practitioner_id, pathway_id)
);
`,
  },
  {
    // Clinical toolkit content types (Part 4). content_kind file|link|text:
    // file/link use url (+pathname for Blob files); text uses body (faq/email).
    id: '004_toolkit_resources',
    sql: `
CREATE TABLE IF NOT EXISTS toolkit_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  audience TEXT NOT NULL DEFAULT 'all',
  content_kind TEXT NOT NULL,
  url TEXT,
  body TEXT,
  pathname TEXT,
  thumbnail_url TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`,
  },
  {
    // Events hub (Part 5). NOTE: named hub_events because the existing `events`
    // table is the practitioner audit trail — do not conflate the two.
    id: '005_hub_events',
    sql: `
CREATE TABLE IF NOT EXISTS hub_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  location TEXT,
  audience TEXT NOT NULL DEFAULT 'all',
  recording_url TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS hub_event_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES hub_events(id),
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_id, practitioner_id)
);
CREATE INDEX IF NOT EXISTS idx_hub_event_regs_event ON hub_event_registrations(event_id);
`,
  },
  {
    // Tier snapshots + opt-in leaderboard (Part 6).
    id: '006_tiering',
    sql: `
CREATE TABLE IF NOT EXISTS tier_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  tier TEXT NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tier_history_practitioner ON tier_history(practitioner_id);
CREATE TABLE IF NOT EXISTS leaderboard_optins (
  practitioner_id INTEGER PRIMARY KEY REFERENCES practitioners(id),
  opted_in INTEGER NOT NULL DEFAULT 0,
  display_name TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`,
  },
  {
    // Admin-configurable "What's New" homepage cards (Part 2).
    id: '007_homepage_widgets',
    sql: `
CREATE TABLE IF NOT EXISTS homepage_widgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT,
  link_url TEXT,
  image_url TEXT,
  audience TEXT NOT NULL DEFAULT 'all',
  position INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`,
  },
  {
    // Part 2: track whether a practitioner has seen the one-time Welcome experience.
    // Backfill existing rows to 1 so current accounts are not shown the takeover;
    // only sign-ups created after this migration default to 0 and see it once.
    id: '008_has_seen_welcome',
    sql: `
ALTER TABLE practitioners ADD COLUMN has_seen_welcome INTEGER NOT NULL DEFAULT 0;
UPDATE practitioners SET has_seen_welcome = 1;
`,
  },
];

/** Applies any not-yet-run migrations, in order, exactly once. Idempotent. */
export async function runMigrations(c: Client): Promise<void> {
  await c.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`
  );
  const applied = new Set(
    (await c.execute('SELECT id FROM schema_migrations')).rows.map((r) => r.id as string)
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await c.executeMultiple(m.sql);
    await c.execute({ sql: 'INSERT INTO schema_migrations (id) VALUES (?)', args: [m.id] });
  }
}
