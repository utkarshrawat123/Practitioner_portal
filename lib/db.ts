import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

export type QualificationStatus = 'qualified' | 'student';
export type Status = 'pending' | 'approved' | 'flagged' | 'rejected';

export interface Verification {
  reasonCode: string;
  confidence: string | null;
  detail: string;
  manualSearchUrl: string;
}

export interface Practitioner {
  id: number;
  name: string;
  email: string;
  registerBody: string;
  registerNumber: string;
  qualificationStatus: QualificationStatus;
  tier: string;
  status: Status;
  verification: Verification | null;
  affiliateCode: string | null;
  affiliateLink: string | null;
  pendingSync: boolean;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface EventRow {
  id: number;
  practitionerId: number;
  type: string;
  detail: string;
  createdAt: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS practitioners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  register_body TEXT NOT NULL,
  register_number TEXT NOT NULL,
  qualification_status TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'pending',
  verification_json TEXT,
  affiliate_code TEXT UNIQUE,
  affiliate_link TEXT,
  pending_sync INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  decided_by TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  type TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ai_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  profile_input TEXT NOT NULL,
  status TEXT NOT NULL,
  safety_flags TEXT NOT NULL,
  output_json TEXT,
  grounding_warnings TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_file TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  takeaways_json TEXT NOT NULL,
  quiz_json TEXT NOT NULL,
  topics_json TEXT NOT NULL,
  claim_flags_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS lesson_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(practitioner_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS login_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let db: Database.Database | null = null;

function defaultDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  // Serverless platforms (Vercel/AWS Lambda) have a read-only filesystem except
  // for /tmp. Fall back there so the app boots. NOTE: /tmp is per-instance and
  // ephemeral — data does not persist across cold starts. Point DB_PATH at a
  // hosted database (or a Turso/libSQL URL) for durable production storage.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join('/tmp', 'practitioners.db');
  }
  return path.join(process.cwd(), 'data', 'practitioners.db');
}

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = defaultDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(SCHEMA);
  }
  return db;
}

export function resetDbForTests(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function rowToPractitioner(row: any): Practitioner {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    registerBody: row.register_body,
    registerNumber: row.register_number,
    qualificationStatus: row.qualification_status,
    tier: row.tier,
    status: row.status,
    verification: row.verification_json ? JSON.parse(row.verification_json) : null,
    affiliateCode: row.affiliate_code,
    affiliateLink: row.affiliate_link,
    pendingSync: row.pending_sync === 1,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
  };
}

export function insertApplication(input: {
  name: string;
  email: string;
  registerBody: string;
  registerNumber: string;
  qualificationStatus: QualificationStatus;
}): Practitioner {
  const res = getDb()
    .prepare(
      `INSERT INTO practitioners (name, email, register_body, register_number, qualification_status)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(input.name, input.email, input.registerBody, input.registerNumber, input.qualificationStatus);
  return getPractitioner(Number(res.lastInsertRowid))!;
}

export function getPractitioner(id: number): Practitioner | null {
  const row = getDb().prepare(`SELECT * FROM practitioners WHERE id = ?`).get(id);
  return row ? rowToPractitioner(row) : null;
}

export function findByEmail(email: string): Practitioner | null {
  const row = getDb()
    .prepare(`SELECT * FROM practitioners WHERE email = ? COLLATE NOCASE`)
    .get(email);
  return row ? rowToPractitioner(row) : null;
}

export function hasDuplicateRegistration(
  registerBody: string,
  registerNumber: string,
  excludeId: number
): boolean {
  const row = getDb()
    .prepare(
      `SELECT id FROM practitioners
       WHERE register_body = ? AND register_number = ? COLLATE NOCASE AND id != ?`
    )
    .get(registerBody, registerNumber, excludeId);
  return !!row;
}

export function flagPractitioner(id: number, verification: Verification): Practitioner {
  getDb()
    .prepare(
      `UPDATE practitioners
       SET status = 'flagged', verification_json = ?, decided_at = datetime('now'), decided_by = 'system'
       WHERE id = ?`
    )
    .run(JSON.stringify(verification), id);
  return getPractitioner(id)!;
}

export function markApproved(
  id: number,
  opts: {
    verification?: Verification;
    affiliateCode: string;
    affiliateLink: string;
    pendingSync: boolean;
    decidedBy: string;
  }
): Practitioner {
  const existing = getPractitioner(id)!;
  const verification = opts.verification ?? existing.verification;
  getDb()
    .prepare(
      `UPDATE practitioners
       SET status = 'approved', verification_json = ?, affiliate_code = ?, affiliate_link = ?,
           pending_sync = ?, decided_at = datetime('now'), decided_by = ?
       WHERE id = ?`
    )
    .run(
      verification ? JSON.stringify(verification) : null,
      opts.affiliateCode,
      opts.affiliateLink,
      opts.pendingSync ? 1 : 0,
      opts.decidedBy,
      id
    );
  return getPractitioner(id)!;
}

export function markRejected(id: number, decidedBy: string): Practitioner {
  getDb()
    .prepare(
      `UPDATE practitioners
       SET status = 'rejected', decided_at = datetime('now'), decided_by = ?
       WHERE id = ?`
    )
    .run(decidedBy, id);
  return getPractitioner(id)!;
}

export function setPendingSync(id: number, pending: boolean): void {
  getDb().prepare(`UPDATE practitioners SET pending_sync = ? WHERE id = ?`).run(pending ? 1 : 0, id);
}

export function isCodeTaken(code: string): boolean {
  return !!getDb().prepare(`SELECT id FROM practitioners WHERE affiliate_code = ?`).get(code);
}

export function listPractitioners(status?: Status): Practitioner[] {
  const rows = status
    ? getDb().prepare(`SELECT * FROM practitioners WHERE status = ? ORDER BY created_at DESC, id DESC`).all(status)
    : getDb().prepare(`SELECT * FROM practitioners ORDER BY created_at DESC, id DESC`).all();
  return rows.map(rowToPractitioner);
}

export function addEvent(practitionerId: number, type: string, detail: string): void {
  getDb()
    .prepare(`INSERT INTO events (practitioner_id, type, detail) VALUES (?, ?, ?)`)
    .run(practitionerId, type, detail);
}

export function createAuthToken(practitionerId: number): string {
  const token = randomBytes(32).toString('hex');
  getDb()
    .prepare(
      `INSERT INTO auth_tokens (token, practitioner_id, expires_at)
       VALUES (?, ?, datetime('now', '+15 minutes'))`
    )
    .run(token, practitionerId);
  return token;
}

export function consumeAuthToken(token: string): number | null {
  const row = getDb()
    .prepare(
      `SELECT practitioner_id FROM auth_tokens
       WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')`
    )
    .get(token) as { practitioner_id: number } | undefined;
  if (!row) return null;
  getDb().prepare(`UPDATE auth_tokens SET used_at = datetime('now') WHERE token = ?`).run(token);
  return row.practitioner_id;
}

export function findByCode(code: string): Practitioner | null {
  const row = getDb().prepare(`SELECT * FROM practitioners WHERE affiliate_code = ?`).get(code);
  return row ? rowToPractitioner(row) : null;
}

export function recordClick(practitionerId: number, code: string): void {
  getDb().prepare(`INSERT INTO clicks (practitioner_id, code) VALUES (?, ?)`).run(practitionerId, code);
}

export function clickStats(practitionerId: number): {
  clicksThisMonth: number;
  clicksAllTime: number;
} {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS all_time,
         SUM(CASE WHEN strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now') THEN 1 ELSE 0 END) AS this_month
       FROM clicks WHERE practitioner_id = ?`
    )
    .get(practitionerId) as { all_time: number; this_month: number | null };
  return { clicksThisMonth: row.this_month ?? 0, clicksAllTime: row.all_time };
}

export interface AiQueryRow {
  id: number;
  practitionerId: number;
  practitionerName: string | null;
  profileInput: string;
  status: string;
  safetyFlags: unknown[];
  output: unknown | null;
  groundingWarnings: string[];
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
}

export function recordAiQuery(q: {
  practitionerId: number;
  profileInput: string;
  status: 'ok' | 'out_of_scope' | 'error';
  safetyFlags: unknown[];
  output?: unknown;
  groundingWarnings?: string[];
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}): number {
  const res = getDb()
    .prepare(
      `INSERT INTO ai_queries
         (practitioner_id, profile_input, status, safety_flags, output_json,
          grounding_warnings, model, input_tokens, output_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      q.practitionerId,
      q.profileInput,
      q.status,
      JSON.stringify(q.safetyFlags),
      q.output === undefined ? null : JSON.stringify(q.output),
      JSON.stringify(q.groundingWarnings ?? []),
      q.model ?? null,
      q.inputTokens ?? null,
      q.outputTokens ?? null
    );
  return Number(res.lastInsertRowid);
}

export function listAiQueries(limit = 200): AiQueryRow[] {
  return getDb()
    .prepare(
      `SELECT q.*, p.name AS practitioner_name FROM ai_queries q
       LEFT JOIN practitioners p ON p.id = q.practitioner_id
       ORDER BY q.id DESC LIMIT ?`
    )
    .all(limit)
    .map((r: any) => ({
      id: r.id,
      practitionerId: r.practitioner_id,
      practitionerName: r.practitioner_name,
      profileInput: r.profile_input,
      status: r.status,
      safetyFlags: JSON.parse(r.safety_flags),
      output: r.output_json ? JSON.parse(r.output_json) : null,
      groundingWarnings: r.grounding_warnings ? JSON.parse(r.grounding_warnings) : [],
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      createdAt: r.created_at,
    }));
}

export interface Quiz {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface LessonRow {
  id: number;
  sourceFile: string | null;
  title: string;
  summary: string;
  takeaways: string[];
  quiz: Quiz;
  topics: string[];
  claimFlags: string[];
  status: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
  decidedAt: string | null;
}

function rowToLesson(r: any): LessonRow {
  return {
    id: r.id,
    sourceFile: r.source_file,
    title: r.title,
    summary: r.summary,
    takeaways: JSON.parse(r.takeaways_json),
    quiz: JSON.parse(r.quiz_json),
    topics: JSON.parse(r.topics_json),
    claimFlags: JSON.parse(r.claim_flags_json),
    status: r.status,
    model: r.model,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };
}

export function insertLesson(l: {
  sourceFile: string;
  title: string;
  summary: string;
  takeaways: string[];
  quiz: Quiz;
  topics: string[];
  claimFlags: string[];
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}): number {
  const res = getDb()
    .prepare(
      `INSERT INTO lessons
        (source_file, title, summary, takeaways_json, quiz_json, topics_json,
         claim_flags_json, model, input_tokens, output_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      l.sourceFile,
      l.title,
      l.summary,
      JSON.stringify(l.takeaways),
      JSON.stringify(l.quiz),
      JSON.stringify(l.topics),
      JSON.stringify(l.claimFlags),
      l.model ?? null,
      l.inputTokens ?? null,
      l.outputTokens ?? null
    );
  return Number(res.lastInsertRowid);
}

export function getLesson(id: number): LessonRow | null {
  const row = getDb().prepare(`SELECT * FROM lessons WHERE id = ?`).get(id);
  return row ? rowToLesson(row) : null;
}

export function listLessons(status?: string): LessonRow[] {
  const rows = status
    ? getDb().prepare(`SELECT * FROM lessons WHERE status = ? ORDER BY id DESC`).all(status)
    : getDb().prepare(`SELECT * FROM lessons ORDER BY id DESC`).all();
  return rows.map(rowToLesson);
}

export function updateLessonFields(
  id: number,
  f: { title: string; summary: string; takeaways: string[]; quiz: Quiz; topics: string[] }
): void {
  getDb()
    .prepare(
      `UPDATE lessons SET title = ?, summary = ?, takeaways_json = ?, quiz_json = ?, topics_json = ?
       WHERE id = ?`
    )
    .run(
      f.title,
      f.summary,
      JSON.stringify(f.takeaways),
      JSON.stringify(f.quiz),
      JSON.stringify(f.topics),
      id
    );
}

export function setLessonStatus(
  id: number,
  status: 'published' | 'rejected' | 'draft'
): LessonRow {
  getDb()
    .prepare(`UPDATE lessons SET status = ?, decided_at = datetime('now') WHERE id = ?`)
    .run(status, id);
  return getLesson(id)!;
}

export function listPublishedLessons(opts: { topic?: string; q?: string } = {}): LessonRow[] {
  const clauses = [`status = 'published'`];
  const params: string[] = [];
  if (opts.topic) {
    clauses.push(`topics_json LIKE ?`);
    params.push(`%"${opts.topic}"%`);
  }
  if (opts.q) {
    clauses.push(`(title LIKE ? OR summary LIKE ? OR takeaways_json LIKE ?)`);
    const like = `%${opts.q}%`;
    params.push(like, like, like);
  }
  return getDb()
    .prepare(`SELECT * FROM lessons WHERE ${clauses.join(' AND ')} ORDER BY id DESC`)
    .all(...params)
    .map(rowToLesson);
}

/** Insert-or-delete the unique (practitioner, lesson) pair. Returns the new completed state.
 *  No-op returning false if the lesson is not published (or does not exist). */
export function toggleCompletion(practitionerId: number, lessonId: number): boolean {
  const lesson = getLesson(lessonId);
  if (!lesson || lesson.status !== 'published') return false;
  const existing = getDb()
    .prepare(`SELECT id FROM lesson_completions WHERE practitioner_id = ? AND lesson_id = ?`)
    .get(practitionerId, lessonId);
  if (existing) {
    getDb()
      .prepare(`DELETE FROM lesson_completions WHERE practitioner_id = ? AND lesson_id = ?`)
      .run(practitionerId, lessonId);
    return false;
  }
  getDb()
    .prepare(`INSERT INTO lesson_completions (practitioner_id, lesson_id) VALUES (?, ?)`)
    .run(practitionerId, lessonId);
  return true;
}

export function completedLessonIds(practitionerId: number): number[] {
  return getDb()
    .prepare(`SELECT lesson_id FROM lesson_completions WHERE practitioner_id = ? ORDER BY lesson_id`)
    .all(practitionerId)
    .map((r: any) => r.lesson_id);
}

export function countCompletions(practitionerId: number): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM lesson_completions WHERE practitioner_id = ?`)
    .get(practitionerId) as { n: number };
  return row.n;
}

export function recordLogin(practitionerId: number): void {
  getDb().prepare(`INSERT INTO login_events (practitioner_id) VALUES (?)`).run(practitionerId);
}

/** Login counts in the last 30 days (0–30) and the prior 30 (30–60), plus most-recent time. */
export function loginStats(practitionerId: number): {
  last30: number;
  prior30: number;
  lastAt: string | null;
} {
  const row = getDb()
    .prepare(
      `SELECT
         SUM(CASE WHEN created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS last30,
         SUM(CASE WHEN created_at < datetime('now','-30 days')
                   AND created_at >= datetime('now','-60 days') THEN 1 ELSE 0 END) AS prior30,
         MAX(created_at) AS last_at
       FROM login_events WHERE practitioner_id = ?`
    )
    .get(practitionerId) as { last30: number | null; prior30: number | null; last_at: string | null };
  return { last30: row.last30 ?? 0, prior30: row.prior30 ?? 0, lastAt: row.last_at };
}

export function clickWindows(practitionerId: number): {
  last30: number;
  prior30: number;
  total: number;
  lastAt: string | null;
} {
  const row = getDb()
    .prepare(
      `SELECT
         SUM(CASE WHEN created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS last30,
         SUM(CASE WHEN created_at < datetime('now','-30 days')
                   AND created_at >= datetime('now','-60 days') THEN 1 ELSE 0 END) AS prior30,
         COUNT(*) AS total,
         MAX(created_at) AS last_at
       FROM clicks WHERE practitioner_id = ?`
    )
    .get(practitionerId) as {
    last30: number | null;
    prior30: number | null;
    total: number;
    last_at: string | null;
  };
  return { last30: row.last30 ?? 0, prior30: row.prior30 ?? 0, total: row.total, lastAt: row.last_at };
}

export function aiQueryCount(practitionerId: number, days: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM ai_queries
       WHERE practitioner_id = ? AND created_at >= datetime('now', ?)`
    )
    .get(practitionerId, `-${days} days`) as { n: number };
  return row.n;
}

export function listEvents(practitionerId: number): EventRow[] {
  return getDb()
    .prepare(`SELECT * FROM events WHERE practitioner_id = ? ORDER BY id DESC`)
    .all(practitionerId)
    .map((r: any) => ({
      id: r.id,
      practitionerId: r.practitioner_id,
      type: r.type,
      detail: r.detail,
      createdAt: r.created_at,
    }));
}
