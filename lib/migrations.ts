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
  {
    // Part 3: pathway category + CPD hours, and per-practitioner module completion.
    // module_completions is the explicit completion record; lesson modules also count
    // as complete when their lesson is in lesson_completions (unioned in code).
    id: '009_pathways_cpd',
    sql: `
ALTER TABLE pathways ADD COLUMN category TEXT;
ALTER TABLE pathways ADD COLUMN cpd_hours REAL NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS module_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  module_id INTEGER NOT NULL REFERENCES pathway_modules(id),
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(practitioner_id, module_id)
);
CREATE INDEX IF NOT EXISTS idx_module_completions_practitioner ON module_completions(practitioner_id);
`,
  },
  {
    // Part 5: events hub extras + native community board (community_posts/replies were
    // deferred from Part 1). Upvotes tracked in their own table (one per practitioner).
    id: '010_community_events',
    sql: `
ALTER TABLE hub_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'online';
ALTER TABLE hub_events ADD COLUMN capacity INTEGER;
CREATE TABLE IF NOT EXISTS community_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  author_name TEXT NOT NULL,
  post_type TEXT NOT NULL DEFAULT 'discussion',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts(created_at);
CREATE TABLE IF NOT EXISTS community_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES community_posts(id),
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_community_replies_post ON community_replies(post_id);
CREATE TABLE IF NOT EXISTS community_upvotes (
  post_id INTEGER NOT NULL REFERENCES community_posts(id),
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, practitioner_id)
);
`,
  },
  {
    // Part 6: automation dedupe log (one lifecycle email per practitioner+job+period)
    // and a run log so the admin can see each scheduled job's last status.
    id: '011_automation',
    sql: `
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  job TEXT NOT NULL,
  period TEXT NOT NULL,
  detail TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(practitioner_id, job, period)
);
CREATE TABLE IF NOT EXISTS automation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  ran_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_job ON automation_runs(job, ran_at);
`,
  },
  {
    id: '012_clinical_pearls',
    sql: `
CREATE TABLE IF NOT EXISTS clinical_pearls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  category TEXT,
  audience TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'draft',
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clinical_pearls_status ON clinical_pearls(status);
`,
  },
  {
    id: '013_live_chat',
    sql: `
CREATE TABLE IF NOT EXISTS chat_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  subject TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_practitioner_at TEXT,
  last_admin_at TEXT,
  alerted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status ON chat_conversations(status);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations(updated_at);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_practitioner ON chat_conversations(practitioner_id);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_by_admin INTEGER NOT NULL DEFAULT 0,
  read_by_practitioner INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
`,
  },
  {
    id: '014_certifications',
    sql: `
ALTER TABLE practitioners ADD COLUMN certification_url TEXT;
ALTER TABLE practitioners ADD COLUMN certification_pathname TEXT;
ALTER TABLE practitioners ADD COLUMN certification_filename TEXT;
ALTER TABLE practitioners ADD COLUMN certification_uploaded_at TEXT;
`,
  },
  {
    id: '015_presence',
    sql: `
ALTER TABLE practitioners ADD COLUMN last_seen_at TEXT;
`,
  },
  {
    id: '016_patient_carts',
    sql: `
CREATE TABLE IF NOT EXISTS patient_carts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  patient_name TEXT NOT NULL,
  patient_email TEXT,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  currency TEXT NOT NULL DEFAULT 'GBP',
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  commission_amount REAL NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'mock',
  external_id TEXT,
  pay_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_patient_carts_practitioner ON patient_carts(practitioner_id);
CREATE TABLE IF NOT EXISTS patient_cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id INTEGER NOT NULL REFERENCES patient_carts(id),
  product_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT,
  unit_price REAL NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_patient_cart_items_cart ON patient_cart_items(cart_id);
`,
  },
  {
    id: '017_practitioner_referrals',
    sql: `
CREATE TABLE IF NOT EXISTS practitioner_referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id INTEGER NOT NULL REFERENCES practitioners(id),
  referred_id INTEGER NOT NULL REFERENCES practitioners(id),
  referred_email TEXT NOT NULL,
  invite_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited',
  qualifying_order_id TEXT,
  bonus_amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  signed_up_at TEXT,
  first_sale_at TEXT,
  completed_at TEXT,
  credited_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON practitioner_referrals(referrer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_referred ON practitioner_referrals(referred_id);
`,
  },
  {
    // Referral v2: refund clawback + optional admin approval.
    // `status` gains two values (no constraint to alter, it is plain TEXT):
    //   awaiting_approval — qualified, held for an admin when REFERRAL_REQUIRE_APPROVAL=true
    //   clawed_back       — credit reversed after the qualifying order was refunded/voided
    id: '018_referral_v2',
    sql: `
ALTER TABLE practitioner_referrals ADD COLUMN clawed_back_at TEXT;
ALTER TABLE practitioner_referrals ADD COLUMN approved_by TEXT;
CREATE INDEX IF NOT EXISTS idx_referrals_qualifying_order ON practitioner_referrals(qualifying_order_id);
`,
  },
  {
    // "My Clinic" saved items. One polymorphic table following the
    // pathway_modules (content_kind, content_id) precedent.
    //
    // `item_type` is deliberately NOT called content_kind: that name already
    // means the payload kind (file/link/text) on toolkit_resources and media.
    //
    // No FK on item_id — a deleted source row leaves an orphan, which the read
    // path drops via its join. Same trade pathway_modules already makes.
    id: '019_saved_items',
    sql: `
CREATE TABLE IF NOT EXISTS saved_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(practitioner_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_items_practitioner ON saved_items(practitioner_id);
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
