import { createClient, type Client, type InValue, type Row } from '@libsql/client';
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

let client: Client | null = null;
let schemaReady: Promise<unknown> | null = null;

/**
 * Resolve the database URL. In production, TURSO_DATABASE_URL points at a hosted
 * libSQL/Turso database (durable, shared across all serverless instances). Locally
 * and in tests we use a libSQL file: URL. On Vercel without Turso configured we fall
 * back to /tmp (ephemeral per-instance) so the app still boots.
 */
function dbUrl(): string {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  if (process.env.DB_PATH) return `file:${process.env.DB_PATH}`;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return 'file:/tmp/practitioners.db';
  }
  return `file:${path.join(process.cwd(), 'data', 'practitioners.db')}`;
}

function rawClient(): Client {
  if (!client) {
    const url = dbUrl();
    if (url.startsWith('file:')) {
      fs.mkdirSync(path.dirname(url.slice('file:'.length)), { recursive: true });
    }
    client = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN,
      intMode: 'number',
    });
  }
  return client;
}

/** Returns a ready client, ensuring the schema exists exactly once per process. */
async function getClient(): Promise<Client> {
  const c = rawClient();
  if (!schemaReady) {
    schemaReady = c.executeMultiple(SCHEMA);
  }
  await schemaReady;
  return c;
}

async function one(sql: string, args: InValue[] = []): Promise<Row | undefined> {
  const c = await getClient();
  const res = await c.execute({ sql, args });
  return res.rows[0];
}

async function all(sql: string, args: InValue[] = []): Promise<Row[]> {
  const c = await getClient();
  const res = await c.execute({ sql, args });
  return res.rows;
}

async function run(sql: string, args: InValue[] = []): Promise<{ lastInsertRowid: number; rowsAffected: number }> {
  const c = await getClient();
  const res = await c.execute({ sql, args });
  return {
    lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
    rowsAffected: res.rowsAffected,
  };
}

export function resetDbForTests(): void {
  if (client) {
    client.close();
    client = null;
  }
  schemaReady = null;
}

/** Test-only raw SQL escape hatch (e.g. inserting rows at back-dated timestamps). */
export async function execForTests(
  sql: string,
  args: InValue[] = []
): Promise<{ rows: Row[]; lastInsertRowid: number; rowsAffected: number }> {
  const c = await getClient();
  const res = await c.execute({ sql, args });
  return {
    rows: res.rows,
    lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
    rowsAffected: res.rowsAffected,
  };
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0);
}

function rowToPractitioner(row: Row): Practitioner {
  return {
    id: num(row.id),
    name: row.name as string,
    email: row.email as string,
    registerBody: row.register_body as string,
    registerNumber: row.register_number as string,
    qualificationStatus: row.qualification_status as QualificationStatus,
    tier: row.tier as string,
    status: row.status as Status,
    verification: row.verification_json ? JSON.parse(row.verification_json as string) : null,
    affiliateCode: (row.affiliate_code as string | null) ?? null,
    affiliateLink: (row.affiliate_link as string | null) ?? null,
    pendingSync: num(row.pending_sync) === 1,
    createdAt: row.created_at as string,
    decidedAt: (row.decided_at as string | null) ?? null,
    decidedBy: (row.decided_by as string | null) ?? null,
  };
}

export async function insertApplication(input: {
  name: string;
  email: string;
  registerBody: string;
  registerNumber: string;
  qualificationStatus: QualificationStatus;
}): Promise<Practitioner> {
  const res = await run(
    `INSERT INTO practitioners (name, email, register_body, register_number, qualification_status)
     VALUES (?, ?, ?, ?, ?)`,
    [input.name, input.email, input.registerBody, input.registerNumber, input.qualificationStatus]
  );
  return (await getPractitioner(res.lastInsertRowid))!;
}

export async function getPractitioner(id: number): Promise<Practitioner | null> {
  const row = await one(`SELECT * FROM practitioners WHERE id = ?`, [id]);
  return row ? rowToPractitioner(row) : null;
}

export async function findByEmail(email: string): Promise<Practitioner | null> {
  const row = await one(`SELECT * FROM practitioners WHERE email = ? COLLATE NOCASE`, [email]);
  return row ? rowToPractitioner(row) : null;
}

export async function hasDuplicateRegistration(
  registerBody: string,
  registerNumber: string,
  excludeId: number
): Promise<boolean> {
  const row = await one(
    `SELECT id FROM practitioners
     WHERE register_body = ? AND register_number = ? COLLATE NOCASE AND id != ?`,
    [registerBody, registerNumber, excludeId]
  );
  return !!row;
}

export async function flagPractitioner(id: number, verification: Verification): Promise<Practitioner> {
  await run(
    `UPDATE practitioners
     SET status = 'flagged', verification_json = ?, decided_at = datetime('now'), decided_by = 'system'
     WHERE id = ?`,
    [JSON.stringify(verification), id]
  );
  return (await getPractitioner(id))!;
}

export async function markApproved(
  id: number,
  opts: {
    verification?: Verification;
    affiliateCode: string;
    affiliateLink: string;
    pendingSync: boolean;
    decidedBy: string;
  }
): Promise<Practitioner> {
  const existing = (await getPractitioner(id))!;
  const verification = opts.verification ?? existing.verification;
  await run(
    `UPDATE practitioners
     SET status = 'approved', verification_json = ?, affiliate_code = ?, affiliate_link = ?,
         pending_sync = ?, decided_at = datetime('now'), decided_by = ?
     WHERE id = ?`,
    [
      verification ? JSON.stringify(verification) : null,
      opts.affiliateCode,
      opts.affiliateLink,
      opts.pendingSync ? 1 : 0,
      opts.decidedBy,
      id,
    ]
  );
  return (await getPractitioner(id))!;
}

export async function markRejected(id: number, decidedBy: string): Promise<Practitioner> {
  await run(
    `UPDATE practitioners SET status = 'rejected', decided_at = datetime('now'), decided_by = ? WHERE id = ?`,
    [decidedBy, id]
  );
  return (await getPractitioner(id))!;
}

export async function setPendingSync(id: number, pending: boolean): Promise<void> {
  await run(`UPDATE practitioners SET pending_sync = ? WHERE id = ?`, [pending ? 1 : 0, id]);
}

export async function isCodeTaken(code: string): Promise<boolean> {
  return !!(await one(`SELECT id FROM practitioners WHERE affiliate_code = ?`, [code]));
}

export async function listPractitioners(status?: Status): Promise<Practitioner[]> {
  const rows = status
    ? await all(`SELECT * FROM practitioners WHERE status = ? ORDER BY created_at DESC, id DESC`, [status])
    : await all(`SELECT * FROM practitioners ORDER BY created_at DESC, id DESC`);
  return rows.map(rowToPractitioner);
}

export async function addEvent(practitionerId: number, type: string, detail: string): Promise<void> {
  await run(`INSERT INTO events (practitioner_id, type, detail) VALUES (?, ?, ?)`, [
    practitionerId,
    type,
    detail,
  ]);
}

export async function createAuthToken(practitionerId: number): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await run(
    `INSERT INTO auth_tokens (token, practitioner_id, expires_at)
     VALUES (?, ?, datetime('now', '+15 minutes'))`,
    [token, practitionerId]
  );
  return token;
}

export async function consumeAuthToken(token: string): Promise<number | null> {
  const row = await one(
    `SELECT practitioner_id FROM auth_tokens
     WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')`,
    [token]
  );
  if (!row) return null;
  await run(`UPDATE auth_tokens SET used_at = datetime('now') WHERE token = ?`, [token]);
  return num(row.practitioner_id);
}

export async function findByCode(code: string): Promise<Practitioner | null> {
  const row = await one(`SELECT * FROM practitioners WHERE affiliate_code = ?`, [code]);
  return row ? rowToPractitioner(row) : null;
}

export async function recordClick(practitionerId: number, code: string): Promise<void> {
  await run(`INSERT INTO clicks (practitioner_id, code) VALUES (?, ?)`, [practitionerId, code]);
}

export async function clickStats(practitionerId: number): Promise<{
  clicksThisMonth: number;
  clicksAllTime: number;
}> {
  const row = await one(
    `SELECT
       COUNT(*) AS all_time,
       SUM(CASE WHEN strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now') THEN 1 ELSE 0 END) AS this_month
     FROM clicks WHERE practitioner_id = ?`,
    [practitionerId]
  );
  return { clicksThisMonth: num(row?.this_month), clicksAllTime: num(row?.all_time) };
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

export async function recordAiQuery(q: {
  practitionerId: number;
  profileInput: string;
  status: 'ok' | 'out_of_scope' | 'error';
  safetyFlags: unknown[];
  output?: unknown;
  groundingWarnings?: string[];
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<number> {
  const res = await run(
    `INSERT INTO ai_queries
       (practitioner_id, profile_input, status, safety_flags, output_json,
        grounding_warnings, model, input_tokens, output_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      q.practitionerId,
      q.profileInput,
      q.status,
      JSON.stringify(q.safetyFlags),
      q.output === undefined ? null : JSON.stringify(q.output),
      JSON.stringify(q.groundingWarnings ?? []),
      q.model ?? null,
      q.inputTokens ?? null,
      q.outputTokens ?? null,
    ]
  );
  return res.lastInsertRowid;
}

export async function listAiQueries(limit = 200): Promise<AiQueryRow[]> {
  const rows = await all(
    `SELECT q.*, p.name AS practitioner_name FROM ai_queries q
     LEFT JOIN practitioners p ON p.id = q.practitioner_id
     ORDER BY q.id DESC LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({
    id: num(r.id),
    practitionerId: num(r.practitioner_id),
    practitionerName: (r.practitioner_name as string | null) ?? null,
    profileInput: r.profile_input as string,
    status: r.status as string,
    safetyFlags: JSON.parse(r.safety_flags as string),
    output: r.output_json ? JSON.parse(r.output_json as string) : null,
    groundingWarnings: r.grounding_warnings ? JSON.parse(r.grounding_warnings as string) : [],
    model: (r.model as string | null) ?? null,
    inputTokens: r.input_tokens === null ? null : num(r.input_tokens),
    outputTokens: r.output_tokens === null ? null : num(r.output_tokens),
    createdAt: r.created_at as string,
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

function rowToLesson(r: Row): LessonRow {
  return {
    id: num(r.id),
    sourceFile: (r.source_file as string | null) ?? null,
    title: r.title as string,
    summary: r.summary as string,
    takeaways: JSON.parse(r.takeaways_json as string),
    quiz: JSON.parse(r.quiz_json as string),
    topics: JSON.parse(r.topics_json as string),
    claimFlags: JSON.parse(r.claim_flags_json as string),
    status: r.status as string,
    model: (r.model as string | null) ?? null,
    inputTokens: r.input_tokens === null ? null : num(r.input_tokens),
    outputTokens: r.output_tokens === null ? null : num(r.output_tokens),
    createdAt: r.created_at as string,
    decidedAt: (r.decided_at as string | null) ?? null,
  };
}

export async function insertLesson(l: {
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
}): Promise<number> {
  const res = await run(
    `INSERT INTO lessons
      (source_file, title, summary, takeaways_json, quiz_json, topics_json,
       claim_flags_json, model, input_tokens, output_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      l.sourceFile,
      l.title,
      l.summary,
      JSON.stringify(l.takeaways),
      JSON.stringify(l.quiz),
      JSON.stringify(l.topics),
      JSON.stringify(l.claimFlags),
      l.model ?? null,
      l.inputTokens ?? null,
      l.outputTokens ?? null,
    ]
  );
  return res.lastInsertRowid;
}

export async function getLesson(id: number): Promise<LessonRow | null> {
  const row = await one(`SELECT * FROM lessons WHERE id = ?`, [id]);
  return row ? rowToLesson(row) : null;
}

export async function listLessons(status?: string): Promise<LessonRow[]> {
  const rows = status
    ? await all(`SELECT * FROM lessons WHERE status = ? ORDER BY id DESC`, [status])
    : await all(`SELECT * FROM lessons ORDER BY id DESC`);
  return rows.map(rowToLesson);
}

export async function updateLessonFields(
  id: number,
  f: { title: string; summary: string; takeaways: string[]; quiz: Quiz; topics: string[] }
): Promise<void> {
  await run(
    `UPDATE lessons SET title = ?, summary = ?, takeaways_json = ?, quiz_json = ?, topics_json = ? WHERE id = ?`,
    [f.title, f.summary, JSON.stringify(f.takeaways), JSON.stringify(f.quiz), JSON.stringify(f.topics), id]
  );
}

export async function setLessonStatus(
  id: number,
  status: 'published' | 'rejected' | 'draft'
): Promise<LessonRow> {
  await run(`UPDATE lessons SET status = ?, decided_at = datetime('now') WHERE id = ?`, [status, id]);
  return (await getLesson(id))!;
}

export async function listPublishedLessons(
  opts: { topic?: string; q?: string } = {}
): Promise<LessonRow[]> {
  const clauses = [`status = 'published'`];
  const params: InValue[] = [];
  if (opts.topic) {
    clauses.push(`topics_json LIKE ?`);
    params.push(`%"${opts.topic}"%`);
  }
  if (opts.q) {
    clauses.push(`(title LIKE ? OR summary LIKE ? OR takeaways_json LIKE ?)`);
    const like = `%${opts.q}%`;
    params.push(like, like, like);
  }
  const rows = await all(
    `SELECT * FROM lessons WHERE ${clauses.join(' AND ')} ORDER BY id DESC`,
    params
  );
  return rows.map(rowToLesson);
}

/** Insert-or-delete the unique (practitioner, lesson) pair. Returns the new completed state.
 *  No-op returning false if the lesson is not published (or does not exist). */
export async function toggleCompletion(practitionerId: number, lessonId: number): Promise<boolean> {
  const lesson = await getLesson(lessonId);
  if (!lesson || lesson.status !== 'published') return false;
  const existing = await one(
    `SELECT id FROM lesson_completions WHERE practitioner_id = ? AND lesson_id = ?`,
    [practitionerId, lessonId]
  );
  if (existing) {
    await run(`DELETE FROM lesson_completions WHERE practitioner_id = ? AND lesson_id = ?`, [
      practitionerId,
      lessonId,
    ]);
    return false;
  }
  await run(`INSERT INTO lesson_completions (practitioner_id, lesson_id) VALUES (?, ?)`, [
    practitionerId,
    lessonId,
  ]);
  return true;
}

export async function completedLessonIds(practitionerId: number): Promise<number[]> {
  const rows = await all(
    `SELECT lesson_id FROM lesson_completions WHERE practitioner_id = ? ORDER BY lesson_id`,
    [practitionerId]
  );
  return rows.map((r) => num(r.lesson_id));
}

export async function countCompletions(practitionerId: number): Promise<number> {
  const row = await one(
    `SELECT COUNT(*) AS n FROM lesson_completions WHERE practitioner_id = ?`,
    [practitionerId]
  );
  return num(row?.n);
}

export async function recordLogin(practitionerId: number): Promise<void> {
  await run(`INSERT INTO login_events (practitioner_id) VALUES (?)`, [practitionerId]);
}

/** Login counts in the last 30 days (0–30) and the prior 30 (30–60), plus most-recent time. */
export async function loginStats(practitionerId: number): Promise<{
  last30: number;
  prior30: number;
  lastAt: string | null;
}> {
  const row = await one(
    `SELECT
       SUM(CASE WHEN created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS last30,
       SUM(CASE WHEN created_at < datetime('now','-30 days')
                 AND created_at >= datetime('now','-60 days') THEN 1 ELSE 0 END) AS prior30,
       MAX(created_at) AS last_at
     FROM login_events WHERE practitioner_id = ?`,
    [practitionerId]
  );
  return {
    last30: num(row?.last30),
    prior30: num(row?.prior30),
    lastAt: (row?.last_at as string | null) ?? null,
  };
}

export async function clickWindows(practitionerId: number): Promise<{
  last30: number;
  prior30: number;
  total: number;
  lastAt: string | null;
}> {
  const row = await one(
    `SELECT
       SUM(CASE WHEN created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS last30,
       SUM(CASE WHEN created_at < datetime('now','-30 days')
                 AND created_at >= datetime('now','-60 days') THEN 1 ELSE 0 END) AS prior30,
       COUNT(*) AS total,
       MAX(created_at) AS last_at
     FROM clicks WHERE practitioner_id = ?`,
    [practitionerId]
  );
  return {
    last30: num(row?.last30),
    prior30: num(row?.prior30),
    total: num(row?.total),
    lastAt: (row?.last_at as string | null) ?? null,
  };
}

export async function aiQueryCount(practitionerId: number, days: number): Promise<number> {
  const row = await one(
    `SELECT COUNT(*) AS n FROM ai_queries
     WHERE practitioner_id = ? AND created_at >= datetime('now', ?)`,
    [practitionerId, `-${days} days`]
  );
  return num(row?.n);
}

export async function listEvents(practitionerId: number): Promise<EventRow[]> {
  const rows = await all(`SELECT * FROM events WHERE practitioner_id = ? ORDER BY id DESC`, [
    practitionerId,
  ]);
  return rows.map((r) => ({
    id: num(r.id),
    practitionerId: num(r.practitioner_id),
    type: r.type as string,
    detail: r.detail as string,
    createdAt: r.created_at as string,
  }));
}
