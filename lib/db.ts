import { createClient, type Client, type InValue, type Row } from '@libsql/client';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { runMigrations } from '@/lib/migrations';
import { hasAccess, type Audience } from '@/lib/access';

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
  hasSeenWelcome: boolean;
  certificationUrl: string | null;
  certificationFilename: string | null;
  certificationUploadedAt: string | null;
}

export interface EventRow {
  id: number;
  practitionerId: number;
  type: string;
  detail: string;
  createdAt: string;
}

export interface MediaRow {
  id: number;
  title: string;
  type: 'video' | 'document' | 'slides' | 'image';
  description: string | null;
  contentKind: 'file' | 'link';
  url: string;
  pathname: string | null;
  thumbnailUrl: string | null;
  thumbnailPathname: string | null;
  size: number | null;
  published: boolean;
  createdAt: string;
}

export interface HomepageWidget {
  id: number;
  title: string;
  body: string | null;
  linkUrl: string | null;
  imageUrl: string | null;
  audience: Audience;
  position: number;
  published: boolean;
  createdAt: string;
}

export interface HomepageWidgetInput {
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  imageUrl?: string | null;
  audience?: Audience;
  position?: number;
  published?: boolean;
}

export const SCHEMA = `
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
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  content_kind TEXT NOT NULL,
  url TEXT NOT NULL,
  pathname TEXT,
  thumbnail_url TEXT,
  thumbnail_pathname TEXT,
  size INTEGER,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let client: Client | null = null;
let schemaReady: Promise<unknown> | null = null;

/**
 * Resolve the database URL. In production, TURSO_DATABASE_URL points at a hosted
 * libSQL/Turso database (durable, shared across all serverless instances). Locally
 * and in tests we use a libSQL file: URL.
 *
 * We deliberately do NOT fall back to /tmp on serverless: that storage is
 * per-instance and ephemeral, which silently splits reads/writes across instances
 * (some see Turso, some a throwaway file) and shows stale/empty data. If we're on
 * a serverless platform without Turso configured, fail loudly instead.
 */
function dbUrl(): string {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  if (process.env.DB_PATH) return `file:${process.env.DB_PATH}`;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    throw new Error(
      'TURSO_DATABASE_URL is not set. Refusing to use ephemeral /tmp storage in a ' +
        'serverless environment — configure Turso so data is durable and consistent.'
    );
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
      // libSQL talks to Turso over fetch, and Next.js patches global fetch to
      // cache responses by default — which caches query RESULTS and serves stale
      // data (e.g. the admin list showing long-deleted rows). Force no-store so
      // every query hits the live database.
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    });
  }
  return client;
}

/** Returns a ready client, ensuring the schema + migrations run exactly once per process. */
async function getClient(): Promise<Client> {
  const c = rawClient();
  if (!schemaReady) {
    schemaReady = c.executeMultiple(SCHEMA).then(() => runMigrations(c));
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
    hasSeenWelcome: num(row.has_seen_welcome) === 1,
    certificationUrl: (row.certification_url as string | null) ?? null,
    certificationFilename: (row.certification_filename as string | null) ?? null,
    certificationUploadedAt: (row.certification_uploaded_at as string | null) ?? null,
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

/** Attach an uploaded certification (Blob) to a practitioner — used by the student upload flow. */
export async function setCertification(
  id: number,
  cert: { url: string; pathname: string; filename: string }
): Promise<Practitioner | null> {
  await run(
    `UPDATE practitioners
     SET certification_url = ?, certification_pathname = ?, certification_filename = ?,
         certification_uploaded_at = datetime('now')
     WHERE id = ?`,
    [cert.url, cert.pathname, cert.filename, id]
  );
  return getPractitioner(id);
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

export async function markSeenWelcome(id: number): Promise<void> {
  await run(`UPDATE practitioners SET has_seen_welcome = 1 WHERE id = ?`, [id]);
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

/** Count a practitioner's AI queries since an ISO-ish timestamp — used for rate limiting. */
export async function recentAiQueryCount(practitionerId: number, sinceSqlUtc: string): Promise<number> {
  const r = await one(
    `SELECT COUNT(*) AS n FROM ai_queries WHERE practitioner_id = ? AND created_at >= ?`,
    [practitionerId, sinceSqlUtc]
  );
  return r ? num(r.n) : 0;
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

function rowToMedia(r: Row): MediaRow {
  return {
    id: num(r.id),
    title: r.title as string,
    type: r.type as MediaRow['type'],
    description: (r.description as string | null) ?? null,
    contentKind: r.content_kind as 'file' | 'link',
    url: r.url as string,
    pathname: (r.pathname as string | null) ?? null,
    thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
    thumbnailPathname: (r.thumbnail_pathname as string | null) ?? null,
    size: r.size === null ? null : num(r.size),
    published: num(r.published) === 1,
    createdAt: r.created_at as string,
  };
}

export async function createMedia(m: {
  title: string;
  type: string;
  description: string | null;
  contentKind: 'file' | 'link';
  url: string;
  pathname: string | null;
  thumbnailUrl: string | null;
  thumbnailPathname: string | null;
  size: number | null;
}): Promise<number> {
  const res = await run(
    `INSERT INTO media
      (title, type, description, content_kind, url, pathname, thumbnail_url, thumbnail_pathname, size)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [m.title, m.type, m.description, m.contentKind, m.url, m.pathname, m.thumbnailUrl, m.thumbnailPathname, m.size]
  );
  return res.lastInsertRowid;
}

export async function getMedia(id: number): Promise<MediaRow | null> {
  const row = await one(`SELECT * FROM media WHERE id = ?`, [id]);
  return row ? rowToMedia(row) : null;
}

export async function listMedia(): Promise<MediaRow[]> {
  const rows = await all(`SELECT * FROM media ORDER BY id DESC`);
  return rows.map(rowToMedia);
}

export async function listPublishedMedia(type?: string): Promise<MediaRow[]> {
  const rows = type
    ? await all(`SELECT * FROM media WHERE published = 1 AND type = ? ORDER BY id DESC`, [type])
    : await all(`SELECT * FROM media WHERE published = 1 ORDER BY id DESC`);
  return rows.map(rowToMedia);
}

export async function setMediaPublished(id: number, published: boolean): Promise<MediaRow> {
  await run(`UPDATE media SET published = ? WHERE id = ?`, [published ? 1 : 0, id]);
  return (await getMedia(id))!;
}

export async function deleteMedia(id: number): Promise<void> {
  await run(`DELETE FROM media WHERE id = ?`, [id]);
}

// ---- Clinical Toolkit resources (Part 4) ----

export type ToolkitType =
  | 'handout' | 'protocol' | 'decision_tree' | 'recipe' | 'faq' | 'email_template';

export interface ToolkitResource {
  id: number;
  title: string;
  type: ToolkitType;
  description: string | null;
  audience: Audience;
  contentKind: 'file' | 'link' | 'text';
  url: string | null;
  body: string | null;
  pathname: string | null;
  thumbnailUrl: string | null;
  published: boolean;
  createdAt: string;
}

export interface ToolkitResourceInput {
  title: string;
  type: ToolkitType;
  description?: string | null;
  audience?: Audience;
  contentKind: 'file' | 'link' | 'text';
  url?: string | null;
  body?: string | null;
  pathname?: string | null;
  thumbnailUrl?: string | null;
  published?: boolean;
}

function rowToToolkit(r: Row): ToolkitResource {
  return {
    id: num(r.id),
    title: r.title as string,
    type: r.type as ToolkitType,
    description: (r.description as string | null) ?? null,
    audience: ((r.audience as string | null) ?? 'all') as Audience,
    contentKind: r.content_kind as 'file' | 'link' | 'text',
    url: (r.url as string | null) ?? null,
    body: (r.body as string | null) ?? null,
    pathname: (r.pathname as string | null) ?? null,
    thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
    published: num(r.published) === 1,
    createdAt: r.created_at as string,
  };
}

export async function createToolkitResource(r: ToolkitResourceInput): Promise<ToolkitResource> {
  const res = await run(
    `INSERT INTO toolkit_resources
       (title, type, description, audience, content_kind, url, body, pathname, thumbnail_url, published)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.title, r.type, r.description ?? null, r.audience ?? 'all', r.contentKind,
      r.url ?? null, r.body ?? null, r.pathname ?? null, r.thumbnailUrl ?? null,
      r.published === false ? 0 : 1,
    ]
  );
  return (await getToolkitResource(res.lastInsertRowid))!;
}

export async function getToolkitResource(id: number): Promise<ToolkitResource | null> {
  const row = await one(`SELECT * FROM toolkit_resources WHERE id = ?`, [id]);
  return row ? rowToToolkit(row) : null;
}

export async function listToolkitResources(): Promise<ToolkitResource[]> {
  return (await all(`SELECT * FROM toolkit_resources ORDER BY id DESC`)).map(rowToToolkit);
}

export async function listPublishedToolkitResourcesFor(
  qualificationStatus: QualificationStatus | null,
  type?: string
): Promise<ToolkitResource[]> {
  const rows = type
    ? await all(`SELECT * FROM toolkit_resources WHERE published = 1 AND type = ? ORDER BY id DESC`, [type])
    : await all(`SELECT * FROM toolkit_resources WHERE published = 1 ORDER BY id DESC`);
  const practitioner = qualificationStatus ? { qualificationStatus } : null;
  return rows.map(rowToToolkit).filter((r) => hasAccess(practitioner, r));
}

export async function updateToolkitResource(
  id: number,
  patch: Partial<ToolkitResourceInput>
): Promise<ToolkitResource | null> {
  const cols: string[] = [];
  const vals: InValue[] = [];
  const map: Record<string, string> = {
    title: 'title', type: 'type', description: 'description', audience: 'audience',
    contentKind: 'content_kind', url: 'url', body: 'body', pathname: 'pathname',
    thumbnailUrl: 'thumbnail_url',
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in patch) { cols.push(`${col} = ?`); vals.push((patch as Record<string, InValue>)[key] ?? null); }
  }
  if ('published' in patch) { cols.push('published = ?'); vals.push(patch.published ? 1 : 0); }
  if (cols.length === 0) return getToolkitResource(id);
  vals.push(id);
  await run(`UPDATE toolkit_resources SET ${cols.join(', ')} WHERE id = ?`, vals);
  return getToolkitResource(id);
}

export async function deleteToolkitResource(id: number): Promise<void> {
  await run(`DELETE FROM toolkit_resources WHERE id = ?`, [id]);
}

// ---- Clinical Pearls (Part 7) ----

export interface ClinicalPearl {
  id: number;
  body: string;
  category: string | null;
  audience: Audience;
  status: 'draft' | 'published';
  source: string | null;
  createdAt: string;
}

function rowToPearl(r: Row): ClinicalPearl {
  return {
    id: num(r.id),
    body: r.body as string,
    category: (r.category as string | null) ?? null,
    audience: ((r.audience as string | null) ?? 'all') as Audience,
    status: (r.status as 'draft' | 'published') ?? 'draft',
    source: (r.source as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

export async function createClinicalPearl(p: {
  body: string; category?: string | null; audience?: Audience;
  status?: 'draft' | 'published'; source?: string | null;
}): Promise<ClinicalPearl> {
  const res = await run(
    `INSERT INTO clinical_pearls (body, category, audience, status, source) VALUES (?, ?, ?, ?, ?)`,
    [p.body, p.category ?? null, p.audience ?? 'all', p.status ?? 'draft', p.source ?? null]
  );
  return (await getClinicalPearl(res.lastInsertRowid))!;
}

export async function getClinicalPearl(id: number): Promise<ClinicalPearl | null> {
  const row = await one(`SELECT * FROM clinical_pearls WHERE id = ?`, [id]);
  return row ? rowToPearl(row) : null;
}

export async function listClinicalPearls(status?: string): Promise<ClinicalPearl[]> {
  const rows = status
    ? await all(`SELECT * FROM clinical_pearls WHERE status = ? ORDER BY id DESC`, [status])
    : await all(`SELECT * FROM clinical_pearls ORDER BY id DESC`);
  return rows.map(rowToPearl);
}

export async function listPublishedPearlsFor(
  qualificationStatus: QualificationStatus | null
): Promise<ClinicalPearl[]> {
  const rows = await all(`SELECT * FROM clinical_pearls WHERE status = 'published' ORDER BY id DESC`);
  const practitioner = qualificationStatus ? { qualificationStatus } : null;
  return rows.map(rowToPearl).filter((p) => hasAccess(practitioner, p));
}

export async function updateClinicalPearl(
  id: number,
  patch: { body?: string; category?: string | null; audience?: Audience; status?: 'draft' | 'published' }
): Promise<ClinicalPearl | null> {
  const cols: string[] = [];
  const vals: InValue[] = [];
  if ('body' in patch) { cols.push('body = ?'); vals.push(patch.body ?? ''); }
  if ('category' in patch) { cols.push('category = ?'); vals.push(patch.category ?? null); }
  if ('audience' in patch) { cols.push('audience = ?'); vals.push(patch.audience ?? 'all'); }
  if ('status' in patch) { cols.push('status = ?'); vals.push(patch.status ?? 'draft'); }
  if (cols.length === 0) return getClinicalPearl(id);
  vals.push(id);
  await run(`UPDATE clinical_pearls SET ${cols.join(', ')} WHERE id = ?`, vals);
  return getClinicalPearl(id);
}

export async function deleteClinicalPearl(id: number): Promise<void> {
  await run(`DELETE FROM clinical_pearls WHERE id = ?`, [id]);
}

// ---- Homepage "What's New" widgets (Part 2) ----

function rowToWidget(row: Row): HomepageWidget {
  return {
    id: num(row.id),
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    linkUrl: (row.link_url as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    audience: ((row.audience as string | null) ?? 'all') as Audience,
    position: num(row.position),
    published: num(row.published) === 1,
    createdAt: row.created_at as string,
  };
}

export async function createHomepageWidget(w: HomepageWidgetInput): Promise<HomepageWidget> {
  const res = await run(
    `INSERT INTO homepage_widgets (title, body, link_url, image_url, audience, position, published)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      w.title, w.body ?? null, w.linkUrl ?? null, w.imageUrl ?? null,
      w.audience ?? 'all', w.position ?? 0, w.published === false ? 0 : 1,
    ]
  );
  return (await getHomepageWidget(res.lastInsertRowid))!;
}

export async function getHomepageWidget(id: number): Promise<HomepageWidget | null> {
  const row = await one(`SELECT * FROM homepage_widgets WHERE id = ?`, [id]);
  return row ? rowToWidget(row) : null;
}

export async function listHomepageWidgets(): Promise<HomepageWidget[]> {
  const rows = await all(`SELECT * FROM homepage_widgets ORDER BY position ASC, id ASC`);
  return rows.map(rowToWidget);
}

export async function listPublishedWidgetsFor(
  qualificationStatus: QualificationStatus | null
): Promise<HomepageWidget[]> {
  const rows = await all(
    `SELECT * FROM homepage_widgets WHERE published = 1 ORDER BY position ASC, id ASC`
  );
  const practitioner = qualificationStatus ? { qualificationStatus } : null;
  return rows.map(rowToWidget).filter((w) => hasAccess(practitioner, w));
}

export async function updateHomepageWidget(
  id: number,
  patch: Partial<HomepageWidgetInput>
): Promise<HomepageWidget | null> {
  const sets: string[] = [];
  const args: InValue[] = [];
  if (patch.title !== undefined) { sets.push('title = ?'); args.push(patch.title); }
  if (patch.body !== undefined) { sets.push('body = ?'); args.push(patch.body ?? null); }
  if (patch.linkUrl !== undefined) { sets.push('link_url = ?'); args.push(patch.linkUrl ?? null); }
  if (patch.imageUrl !== undefined) { sets.push('image_url = ?'); args.push(patch.imageUrl ?? null); }
  if (patch.audience !== undefined) { sets.push('audience = ?'); args.push(patch.audience); }
  if (patch.position !== undefined) { sets.push('position = ?'); args.push(patch.position); }
  if (patch.published !== undefined) { sets.push('published = ?'); args.push(patch.published ? 1 : 0); }
  if (sets.length > 0) {
    args.push(id);
    await run(`UPDATE homepage_widgets SET ${sets.join(', ')} WHERE id = ?`, args);
  }
  return getHomepageWidget(id);
}

export async function deleteHomepageWidget(id: number): Promise<void> {
  await run(`DELETE FROM homepage_widgets WHERE id = ?`, [id]);
}

// ---- Learning pathways, modules, progress & certificates (Part 3) ----

export interface Pathway {
  id: number; title: string; description: string | null; category: string | null;
  cpdHours: number; audience: Audience; published: boolean; createdAt: string;
}
export interface PathwayInput {
  title: string; description?: string | null; category?: string | null;
  cpdHours?: number; audience?: Audience; published?: boolean;
}
export interface PathwayModule {
  id: number; pathwayId: number; title: string;
  contentKind: 'lesson' | 'media'; contentId: number; position: number; required: boolean;
}
export interface ModuleInput {
  title: string; contentKind: 'lesson' | 'media'; contentId: number;
  position?: number; required?: boolean;
}
export interface Certificate {
  id: number; practitionerId: number; pathwayId: number; issuedAt: string; pdfUrl: string | null;
}
export interface PathwayProgress {
  pathwayId: number; total: number; required: number; completedRequired: number;
  percent: number; complete: boolean; completedModuleIds: number[];
}

function rowToPathway(r: Row): Pathway {
  return {
    id: num(r.id), title: r.title as string,
    description: (r.description as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    cpdHours: r.cpd_hours == null ? 0 : Number(r.cpd_hours),
    audience: ((r.audience as string | null) ?? 'all') as Audience,
    published: num(r.published) === 1,
    createdAt: r.created_at as string,
  };
}
function rowToModule(r: Row): PathwayModule {
  return {
    id: num(r.id), pathwayId: num(r.pathway_id), title: r.title as string,
    contentKind: r.content_kind as 'lesson' | 'media', contentId: num(r.content_id),
    position: num(r.position), required: num(r.required) === 1,
  };
}

export async function createPathway(p: PathwayInput): Promise<Pathway> {
  const res = await run(
    `INSERT INTO pathways (title, description, category, cpd_hours, audience, published)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [p.title, p.description ?? null, p.category ?? null, p.cpdHours ?? 0, p.audience ?? 'all', p.published ? 1 : 0]
  );
  return (await getPathway(res.lastInsertRowid))!;
}
export async function getPathway(id: number): Promise<Pathway | null> {
  const r = await one(`SELECT * FROM pathways WHERE id = ?`, [id]);
  return r ? rowToPathway(r) : null;
}
export async function listPathways(): Promise<Pathway[]> {
  return (await all(`SELECT * FROM pathways ORDER BY category, id`)).map(rowToPathway);
}
export async function listPublishedPathways(): Promise<Pathway[]> {
  return (await all(`SELECT * FROM pathways WHERE published = 1 ORDER BY category, id`)).map(rowToPathway);
}
export async function updatePathway(id: number, patch: Partial<PathwayInput>): Promise<Pathway | null> {
  const sets: string[] = []; const args: InValue[] = [];
  if (patch.title !== undefined) { sets.push('title = ?'); args.push(patch.title); }
  if (patch.description !== undefined) { sets.push('description = ?'); args.push(patch.description ?? null); }
  if (patch.category !== undefined) { sets.push('category = ?'); args.push(patch.category ?? null); }
  if (patch.cpdHours !== undefined) { sets.push('cpd_hours = ?'); args.push(patch.cpdHours); }
  if (patch.audience !== undefined) { sets.push('audience = ?'); args.push(patch.audience); }
  if (patch.published !== undefined) { sets.push('published = ?'); args.push(patch.published ? 1 : 0); }
  if (sets.length) { args.push(id); await run(`UPDATE pathways SET ${sets.join(', ')} WHERE id = ?`, args); }
  return getPathway(id);
}
export async function deletePathway(id: number): Promise<void> {
  await run(`DELETE FROM module_completions WHERE module_id IN (SELECT id FROM pathway_modules WHERE pathway_id = ?)`, [id]);
  await run(`DELETE FROM certificates WHERE pathway_id = ?`, [id]);
  await run(`DELETE FROM pathway_modules WHERE pathway_id = ?`, [id]);
  await run(`DELETE FROM pathways WHERE id = ?`, [id]);
}

export async function addPathwayModule(pathwayId: number, m: ModuleInput): Promise<PathwayModule> {
  const res = await run(
    `INSERT INTO pathway_modules (pathway_id, title, content_kind, content_id, position, required)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [pathwayId, m.title, m.contentKind, m.contentId, m.position ?? 0, m.required === false ? 0 : 1]
  );
  return (await getPathwayModule(res.lastInsertRowid))!;
}
export async function getPathwayModule(id: number): Promise<PathwayModule | null> {
  const r = await one(`SELECT * FROM pathway_modules WHERE id = ?`, [id]);
  return r ? rowToModule(r) : null;
}
export async function listPathwayModules(pathwayId: number): Promise<PathwayModule[]> {
  return (await all(`SELECT * FROM pathway_modules WHERE pathway_id = ? ORDER BY position, id`, [pathwayId])).map(rowToModule);
}
export async function updatePathwayModule(id: number, patch: Partial<ModuleInput>): Promise<PathwayModule | null> {
  const sets: string[] = []; const args: InValue[] = [];
  if (patch.title !== undefined) { sets.push('title = ?'); args.push(patch.title); }
  if (patch.contentKind !== undefined) { sets.push('content_kind = ?'); args.push(patch.contentKind); }
  if (patch.contentId !== undefined) { sets.push('content_id = ?'); args.push(patch.contentId); }
  if (patch.position !== undefined) { sets.push('position = ?'); args.push(patch.position); }
  if (patch.required !== undefined) { sets.push('required = ?'); args.push(patch.required ? 1 : 0); }
  if (sets.length) { args.push(id); await run(`UPDATE pathway_modules SET ${sets.join(', ')} WHERE id = ?`, args); }
  return getPathwayModule(id);
}
export async function deletePathwayModule(id: number): Promise<void> {
  await run(`DELETE FROM module_completions WHERE module_id = ?`, [id]);
  await run(`DELETE FROM pathway_modules WHERE id = ?`, [id]);
}

export async function markModuleComplete(practitionerId: number, moduleId: number): Promise<void> {
  await run(
    `INSERT INTO module_completions (practitioner_id, module_id) VALUES (?, ?)
     ON CONFLICT(practitioner_id, module_id) DO NOTHING`,
    [practitionerId, moduleId]
  );
}
export async function moduleCompletionIds(practitionerId: number): Promise<number[]> {
  return (await all(`SELECT module_id FROM module_completions WHERE practitioner_id = ?`, [practitionerId])).map((r) => num(r.module_id));
}

export async function pathwayProgress(practitionerId: number, pathwayId: number): Promise<PathwayProgress> {
  const modules = await listPathwayModules(pathwayId);
  const explicit = new Set(await moduleCompletionIds(practitionerId));
  const completedLessons = new Set(await completedLessonIds(practitionerId));
  const completedModuleIds: number[] = [];
  for (const m of modules) {
    const done = explicit.has(m.id) || (m.contentKind === 'lesson' && completedLessons.has(m.contentId));
    if (done) completedModuleIds.push(m.id);
  }
  const requiredMods = modules.filter((m) => m.required);
  const completedRequired = requiredMods.filter((m) => completedModuleIds.includes(m.id)).length;
  const required = requiredMods.length;
  const percent = required === 0 ? 0 : Math.round((completedRequired / required) * 100);
  return {
    pathwayId, total: modules.length, required, completedRequired, percent,
    complete: required > 0 && completedRequired === required, completedModuleIds,
  };
}
export async function allPathwayProgress(practitionerId: number): Promise<Record<number, PathwayProgress>> {
  const pathways = await listPublishedPathways();
  const out: Record<number, PathwayProgress> = {};
  for (const p of pathways) out[p.id] = await pathwayProgress(practitionerId, p.id);
  return out;
}

function rowToCertificate(r: Row): Certificate {
  return {
    id: num(r.id), practitionerId: num(r.practitioner_id), pathwayId: num(r.pathway_id),
    issuedAt: r.issued_at as string, pdfUrl: (r.pdf_url as string | null) ?? null,
  };
}
export async function getCertificate(practitionerId: number, pathwayId: number): Promise<Certificate | null> {
  const r = await one(`SELECT * FROM certificates WHERE practitioner_id = ? AND pathway_id = ?`, [practitionerId, pathwayId]);
  return r ? rowToCertificate(r) : null;
}
export async function listCertificates(practitionerId: number): Promise<Certificate[]> {
  return (await all(`SELECT * FROM certificates WHERE practitioner_id = ? ORDER BY issued_at DESC`, [practitionerId])).map(rowToCertificate);
}
export async function issueCertificate(practitionerId: number, pathwayId: number, pdfUrl: string): Promise<Certificate> {
  await run(
    `INSERT INTO certificates (practitioner_id, pathway_id, pdf_url) VALUES (?, ?, ?)
     ON CONFLICT(practitioner_id, pathway_id) DO NOTHING`,
    [practitionerId, pathwayId, pdfUrl]
  );
  return (await getCertificate(practitionerId, pathwayId))!;
}

// ---- Events hub + native community board (Part 5) ----

export interface HubEvent {
  id: number; title: string; description: string | null; startsAt: string; endsAt: string | null;
  location: string | null; eventType: 'online' | 'in_person'; capacity: number | null;
  audience: Audience; recordingUrl: string | null; published: boolean; createdAt: string;
}
export interface HubEventInput {
  title: string; description?: string | null; startsAt: string; endsAt?: string | null;
  location?: string | null; eventType?: 'online' | 'in_person'; capacity?: number | null;
  audience?: Audience; recordingUrl?: string | null; published?: boolean;
}
function rowToEvent(r: Row): HubEvent {
  return {
    id: num(r.id), title: r.title as string, description: (r.description as string | null) ?? null,
    startsAt: r.starts_at as string, endsAt: (r.ends_at as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    eventType: ((r.event_type as string | null) ?? 'online') as 'online' | 'in_person',
    capacity: r.capacity == null ? null : num(r.capacity),
    audience: ((r.audience as string | null) ?? 'all') as Audience,
    recordingUrl: (r.recording_url as string | null) ?? null,
    published: num(r.published) === 1, createdAt: r.created_at as string,
  };
}
export async function createHubEvent(e: HubEventInput): Promise<HubEvent> {
  const res = await run(
    `INSERT INTO hub_events (title, description, starts_at, ends_at, location, event_type, capacity, audience, recording_url, published)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.title, e.description ?? null, e.startsAt, e.endsAt ?? null, e.location ?? null,
     e.eventType ?? 'online', e.capacity ?? null, e.audience ?? 'all', e.recordingUrl ?? null, e.published === false ? 0 : 1]
  );
  return (await getHubEvent(res.lastInsertRowid))!;
}
export async function getHubEvent(id: number): Promise<HubEvent | null> {
  const r = await one(`SELECT * FROM hub_events WHERE id = ?`, [id]);
  return r ? rowToEvent(r) : null;
}
export async function listHubEvents(): Promise<HubEvent[]> {
  return (await all(`SELECT * FROM hub_events ORDER BY starts_at DESC`)).map(rowToEvent);
}
export async function listPublishedEvents(): Promise<HubEvent[]> {
  return (await all(`SELECT * FROM hub_events WHERE published = 1 ORDER BY starts_at ASC`)).map(rowToEvent);
}
export async function updateHubEvent(id: number, patch: Partial<HubEventInput>): Promise<HubEvent | null> {
  const map: Record<string, string> = { title: 'title', description: 'description', startsAt: 'starts_at', endsAt: 'ends_at', location: 'location', eventType: 'event_type', capacity: 'capacity', audience: 'audience', recordingUrl: 'recording_url' };
  const sets: string[] = []; const args: InValue[] = [];
  for (const [k, col] of Object.entries(map)) {
    if ((patch as Record<string, unknown>)[k] !== undefined) { sets.push(`${col} = ?`); args.push(((patch as Record<string, unknown>)[k] as InValue) ?? null); }
  }
  if (patch.published !== undefined) { sets.push('published = ?'); args.push(patch.published ? 1 : 0); }
  if (sets.length) { args.push(id); await run(`UPDATE hub_events SET ${sets.join(', ')} WHERE id = ?`, args); }
  return getHubEvent(id);
}
export async function deleteHubEvent(id: number): Promise<void> {
  await run(`DELETE FROM hub_event_registrations WHERE event_id = ?`, [id]);
  await run(`DELETE FROM hub_events WHERE id = ?`, [id]);
}
export async function registerForEvent(practitionerId: number, eventId: number): Promise<void> {
  await run(`INSERT INTO hub_event_registrations (event_id, practitioner_id) VALUES (?, ?) ON CONFLICT(event_id, practitioner_id) DO NOTHING`, [eventId, practitionerId]);
}
export async function unregisterFromEvent(practitionerId: number, eventId: number): Promise<void> {
  await run(`DELETE FROM hub_event_registrations WHERE event_id = ? AND practitioner_id = ?`, [eventId, practitionerId]);
}
export async function registeredEventIds(practitionerId: number): Promise<number[]> {
  return (await all(`SELECT event_id FROM hub_event_registrations WHERE practitioner_id = ?`, [practitionerId])).map((r) => num(r.event_id));
}
export async function eventRegistrationCount(eventId: number): Promise<number> {
  const r = await one(`SELECT COUNT(*) AS n FROM hub_event_registrations WHERE event_id = ?`, [eventId]);
  return num(r?.n);
}

export interface CommunityPost {
  id: number; practitionerId: number; authorName: string; postType: string;
  title: string; body: string; pinned: boolean; hidden: boolean; createdAt: string;
  upvotes: number; replyCount: number;
}
export interface CommunityReply {
  id: number; postId: number; practitionerId: number; authorName: string; body: string; hidden: boolean; createdAt: string;
}
function rowToPost(r: Row): CommunityPost {
  return {
    id: num(r.id), practitionerId: num(r.practitioner_id), authorName: r.author_name as string,
    postType: r.post_type as string, title: r.title as string, body: r.body as string,
    pinned: num(r.pinned) === 1, hidden: num(r.hidden) === 1, createdAt: r.created_at as string,
    upvotes: num(r.upvotes), replyCount: num(r.reply_count),
  };
}
export async function createCommunityPost(p: { practitionerId: number; authorName: string; postType: string; title: string; body: string }): Promise<number> {
  const res = await run(
    `INSERT INTO community_posts (practitioner_id, author_name, post_type, title, body) VALUES (?, ?, ?, ?, ?)`,
    [p.practitionerId, p.authorName, p.postType, p.title, p.body]
  );
  return res.lastInsertRowid;
}
const POST_SELECT = `
  SELECT p.*,
    (SELECT COUNT(*) FROM community_upvotes u WHERE u.post_id = p.id) AS upvotes,
    (SELECT COUNT(*) FROM community_replies r WHERE r.post_id = p.id AND r.hidden = 0) AS reply_count
  FROM community_posts p`;
export async function listCommunityPosts(opts: { includeHidden?: boolean } = {}): Promise<CommunityPost[]> {
  const where = opts.includeHidden ? '' : 'WHERE p.hidden = 0';
  return (await all(`${POST_SELECT} ${where} ORDER BY p.pinned DESC, p.created_at DESC`)).map(rowToPost);
}
export async function getCommunityPost(id: number): Promise<CommunityPost | null> {
  const r = await one(`${POST_SELECT} WHERE p.id = ?`, [id]);
  return r ? rowToPost(r) : null;
}
export async function setPostHidden(id: number, hidden: boolean): Promise<void> {
  await run(`UPDATE community_posts SET hidden = ? WHERE id = ?`, [hidden ? 1 : 0, id]);
}
export async function setPostPinned(id: number, pinned: boolean): Promise<void> {
  await run(`UPDATE community_posts SET pinned = ? WHERE id = ?`, [pinned ? 1 : 0, id]);
}
export async function deleteCommunityPost(id: number): Promise<void> {
  await run(`DELETE FROM community_upvotes WHERE post_id = ?`, [id]);
  await run(`DELETE FROM community_replies WHERE post_id = ?`, [id]);
  await run(`DELETE FROM community_posts WHERE id = ?`, [id]);
}
export async function createCommunityReply(p: { postId: number; practitionerId: number; authorName: string; body: string }): Promise<number> {
  const res = await run(`INSERT INTO community_replies (post_id, practitioner_id, author_name, body) VALUES (?, ?, ?, ?)`, [p.postId, p.practitionerId, p.authorName, p.body]);
  return res.lastInsertRowid;
}
export async function listCommunityReplies(postId: number, opts: { includeHidden?: boolean } = {}): Promise<CommunityReply[]> {
  const where = opts.includeHidden ? 'WHERE post_id = ?' : 'WHERE post_id = ? AND hidden = 0';
  const rows = await all(`SELECT * FROM community_replies ${where} ORDER BY created_at ASC`, [postId]);
  return rows.map((r) => ({ id: num(r.id), postId: num(r.post_id), practitionerId: num(r.practitioner_id), authorName: r.author_name as string, body: r.body as string, hidden: num(r.hidden) === 1, createdAt: r.created_at as string }));
}
export async function setReplyHidden(id: number, hidden: boolean): Promise<void> {
  await run(`UPDATE community_replies SET hidden = ? WHERE id = ?`, [hidden ? 1 : 0, id]);
}
export async function toggleUpvote(practitionerId: number, postId: number): Promise<boolean> {
  const existing = await one(`SELECT 1 AS x FROM community_upvotes WHERE post_id = ? AND practitioner_id = ?`, [postId, practitionerId]);
  if (existing) { await run(`DELETE FROM community_upvotes WHERE post_id = ? AND practitioner_id = ?`, [postId, practitionerId]); return false; }
  await run(`INSERT INTO community_upvotes (post_id, practitioner_id) VALUES (?, ?)`, [postId, practitionerId]);
  return true;
}
export async function upvotedPostIds(practitionerId: number): Promise<number[]> {
  return (await all(`SELECT post_id FROM community_upvotes WHERE practitioner_id = ?`, [practitionerId])).map((r) => num(r.post_id));
}

// ---- Part 6: tiering, leaderboard, engagement inputs, automation logs ----

export async function recordTier(practitionerId: number, tier: string): Promise<void> {
  await run(`INSERT INTO tier_history (practitioner_id, tier) VALUES (?, ?)`, [practitionerId, tier]);
}
export async function latestTier(practitionerId: number): Promise<string | null> {
  const r = await one(`SELECT tier FROM tier_history WHERE practitioner_id = ? ORDER BY computed_at DESC, id DESC LIMIT 1`, [practitionerId]);
  return (r?.tier as string | null) ?? null;
}
export async function listTierHistory(practitionerId: number): Promise<{ tier: string; computedAt: string }[]> {
  return (await all(`SELECT tier, computed_at FROM tier_history WHERE practitioner_id = ? ORDER BY computed_at DESC`, [practitionerId]))
    .map((r) => ({ tier: r.tier as string, computedAt: r.computed_at as string }));
}

export interface LeaderboardOptin { practitionerId: number; optedIn: boolean; displayName: string | null }
export async function setLeaderboardOptin(practitionerId: number, optedIn: boolean, displayName: string | null): Promise<void> {
  await run(
    `INSERT INTO leaderboard_optins (practitioner_id, opted_in, display_name, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(practitioner_id) DO UPDATE SET opted_in = excluded.opted_in, display_name = excluded.display_name, updated_at = datetime('now')`,
    [practitionerId, optedIn ? 1 : 0, displayName]
  );
}
export async function getLeaderboardOptin(practitionerId: number): Promise<LeaderboardOptin | null> {
  const r = await one(`SELECT * FROM leaderboard_optins WHERE practitioner_id = ?`, [practitionerId]);
  return r ? { practitionerId: num(r.practitioner_id), optedIn: num(r.opted_in) === 1, displayName: (r.display_name as string | null) ?? null } : null;
}
export async function listLeaderboardOptins(): Promise<LeaderboardOptin[]> {
  return (await all(`SELECT * FROM leaderboard_optins WHERE opted_in = 1`))
    .map((r) => ({ practitionerId: num(r.practitioner_id), optedIn: true, displayName: (r.display_name as string | null) ?? null }));
}

export async function hasEmailBeenSent(practitionerId: number, job: string, period: string): Promise<boolean> {
  return !!(await one(`SELECT 1 AS x FROM email_log WHERE practitioner_id = ? AND job = ? AND period = ?`, [practitionerId, job, period]));
}
export async function logEmailSent(practitionerId: number, job: string, period: string, detail: string): Promise<void> {
  await run(`INSERT INTO email_log (practitioner_id, job, period, detail) VALUES (?, ?, ?, ?) ON CONFLICT(practitioner_id, job, period) DO NOTHING`, [practitionerId, job, period, detail]);
}
export async function recentEmailLog(limit = 50): Promise<{ practitionerId: number; job: string; period: string; detail: string | null; sentAt: string }[]> {
  return (await all(`SELECT * FROM email_log ORDER BY sent_at DESC LIMIT ?`, [limit]))
    .map((r) => ({ practitionerId: num(r.practitioner_id), job: r.job as string, period: r.period as string, detail: (r.detail as string | null) ?? null, sentAt: r.sent_at as string }));
}

export async function recordAutomationRun(job: string, status: string, detail: string): Promise<void> {
  await run(`INSERT INTO automation_runs (job, status, detail) VALUES (?, ?, ?)`, [job, status, detail]);
}
export async function latestAutomationRuns(): Promise<{ job: string; status: string; detail: string | null; ranAt: string }[]> {
  const rows = await all(
    `SELECT job, status, detail, ran_at FROM automation_runs r
     WHERE id = (SELECT MAX(id) FROM automation_runs r2 WHERE r2.job = r.job) ORDER BY job`
  );
  return rows.map((r) => ({ job: r.job as string, status: r.status as string, detail: (r.detail as string | null) ?? null, ranAt: r.ran_at as string }));
}

export async function aiQueryCount30(practitionerId: number): Promise<number> {
  const r = await one(`SELECT COUNT(*) AS n FROM ai_queries WHERE practitioner_id = ? AND created_at >= datetime('now','-30 days')`, [practitionerId]);
  return num(r?.n);
}
export async function eventsAttendedCount(practitionerId: number): Promise<number> {
  const r = await one(`SELECT COUNT(*) AS n FROM hub_event_registrations WHERE practitioner_id = ?`, [practitionerId]);
  return num(r?.n);
}
export async function communityActivityCount(practitionerId: number): Promise<number> {
  const r = await one(`SELECT (SELECT COUNT(*) FROM community_posts WHERE practitioner_id = ?) + (SELECT COUNT(*) FROM community_replies WHERE practitioner_id = ?) AS n`, [practitionerId, practitionerId]);
  return num(r?.n);
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

// ---- Orders (Shopify webhook → local table) ----

export interface OrderInput {
  orderId: string;
  practitionerId: number | null;
  code: string;
  total: number;
  currency: string;
  financialStatus: string | null;
  createdAt: string; // ISO timestamp from Shopify
}

/** Idempotent upsert keyed on the Shopify order id — safe to replay webhooks. */
export async function recordOrder(o: OrderInput): Promise<void> {
  await run(
    `INSERT INTO orders (order_id, practitioner_id, code, total, currency, financial_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(order_id) DO UPDATE SET
       practitioner_id = excluded.practitioner_id,
       code = excluded.code,
       total = excluded.total,
       currency = excluded.currency,
       financial_status = excluded.financial_status,
       created_at = excluded.created_at`,
    [o.orderId, o.practitionerId, o.code, o.total, o.currency, o.financialStatus, o.createdAt]
  );
}

/** Dashboard order figures for one referral code, from the local orders table. */
export async function orderStatsByCode(code: string): Promise<{
  ordersThisMonth: number;
  ordersAllTime: number;
  revenueThisMonth: number;
  revenueAllTime: number;
}> {
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const row = await one(
    `SELECT
       COUNT(*) AS all_orders,
       COALESCE(SUM(total), 0) AS all_rev,
       COALESCE(SUM(CASE WHEN substr(created_at, 1, 7) = ? THEN 1 ELSE 0 END), 0) AS mo_orders,
       COALESCE(SUM(CASE WHEN substr(created_at, 1, 7) = ? THEN total ELSE 0 END), 0) AS mo_rev
     FROM orders WHERE code = ?`,
    [monthPrefix, monthPrefix, code]
  );
  return {
    ordersAllTime: num(row?.all_orders),
    revenueAllTime: num(row?.all_rev),
    ordersThisMonth: num(row?.mo_orders),
    revenueThisMonth: num(row?.mo_rev),
  };
}

/** Reporting referral figures for one code: 12-month revenue/orders + last-ever order. */
export async function referralDataByCode(code: string): Promise<{
  revenue12mo: number;
  orders12mo: number;
  lastReferralAt: string | null;
}> {
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const row = await one(
    `SELECT
       COALESCE(SUM(CASE WHEN created_at >= ? THEN total ELSE 0 END), 0) AS rev12,
       COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS n12,
       MAX(created_at) AS last_at
     FROM orders WHERE code = ?`,
    [cutoff, cutoff, code]
  );
  return {
    revenue12mo: num(row?.rev12),
    orders12mo: num(row?.n12),
    lastReferralAt: (row?.last_at as string | null) ?? null,
  };
}

// ============================================================
// Live chat (Part 8) — conversations + messages
// ============================================================

export type ChatSender = 'practitioner' | 'admin';
export type ChatStatus = 'open' | 'closed';

export interface ChatConversation {
  id: number;
  practitionerId: number;
  status: ChatStatus;
  subject: string | null;
  createdAt: string;
  updatedAt: string;
  lastPractitionerAt: string | null;
  lastAdminAt: string | null;
  alertedAt: string | null;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  sender: ChatSender;
  body: string;
  createdAt: string;
  readByAdmin: boolean;
  readByPractitioner: boolean;
}

/** A conversation enriched for the admin list view. */
export interface ChatConversationSummary extends ChatConversation {
  practitionerName: string;
  practitionerEmail: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  adminUnread: number;
}

function rowToConversation(r: Row): ChatConversation {
  return {
    id: num(r.id),
    practitionerId: num(r.practitioner_id),
    status: ((r.status as string | null) ?? 'open') as ChatStatus,
    subject: (r.subject as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    lastPractitionerAt: (r.last_practitioner_at as string | null) ?? null,
    lastAdminAt: (r.last_admin_at as string | null) ?? null,
    alertedAt: (r.alerted_at as string | null) ?? null,
  };
}

function rowToChatMessage(r: Row): ChatMessage {
  return {
    id: num(r.id),
    conversationId: num(r.conversation_id),
    sender: r.sender as ChatSender,
    body: r.body as string,
    createdAt: r.created_at as string,
    readByAdmin: num(r.read_by_admin) === 1,
    readByPractitioner: num(r.read_by_practitioner) === 1,
  };
}

export async function getConversation(id: number): Promise<ChatConversation | null> {
  const row = await one(`SELECT * FROM chat_conversations WHERE id = ?`, [id]);
  return row ? rowToConversation(row) : null;
}

/** The practitioner's currently-open conversation, if any. */
export async function getOpenConversationForPractitioner(
  practitionerId: number
): Promise<ChatConversation | null> {
  const row = await one(
    `SELECT * FROM chat_conversations WHERE practitioner_id = ? AND status = 'open'
     ORDER BY id DESC LIMIT 1`,
    [practitionerId]
  );
  return row ? rowToConversation(row) : null;
}

/** Get-or-create the practitioner's open conversation. `subject` seeds a new one only. */
export async function getOrCreateOpenConversation(
  practitionerId: number,
  subject?: string | null
): Promise<ChatConversation> {
  const existing = await getOpenConversationForPractitioner(practitionerId);
  if (existing) return existing;
  const res = await run(
    `INSERT INTO chat_conversations (practitioner_id, subject) VALUES (?, ?)`,
    [practitionerId, subject ?? null]
  );
  return (await getConversation(res.lastInsertRowid))!;
}

/**
 * Append a message and keep the parent conversation's activity columns current.
 * A practitioner message re-arms the missed-message backstop (clears alerted_at);
 * an admin reply also clears it (the practitioner is no longer waiting).
 */
export async function addChatMessage(input: {
  conversationId: number;
  sender: ChatSender;
  body: string;
}): Promise<ChatMessage> {
  const { conversationId, sender, body } = input;
  // The sender has, by definition, "read" their own message.
  const readByAdmin = sender === 'admin' ? 1 : 0;
  const readByPractitioner = sender === 'practitioner' ? 1 : 0;
  const res = await run(
    `INSERT INTO chat_messages (conversation_id, sender, body, read_by_admin, read_by_practitioner)
     VALUES (?, ?, ?, ?, ?)`,
    [conversationId, sender, body, readByAdmin, readByPractitioner]
  );
  const stampCol = sender === 'admin' ? 'last_admin_at' : 'last_practitioner_at';
  await run(
    `UPDATE chat_conversations
       SET updated_at = datetime('now'), ${stampCol} = datetime('now'), alerted_at = NULL
     WHERE id = ?`,
    [conversationId]
  );
  return (await one(`SELECT * FROM chat_messages WHERE id = ?`, [res.lastInsertRowid]).then(
    (r) => rowToChatMessage(r!)
  ));
}

/** Messages for a conversation, oldest-first. `sinceId` returns only newer ones (for polling). */
export async function listChatMessages(
  conversationId: number,
  sinceId = 0
): Promise<ChatMessage[]> {
  const rows = await all(
    `SELECT * FROM chat_messages WHERE conversation_id = ? AND id > ? ORDER BY id ASC`,
    [conversationId, sinceId]
  );
  return rows.map(rowToChatMessage);
}

export async function markConversationReadByAdmin(conversationId: number): Promise<void> {
  await run(
    `UPDATE chat_messages SET read_by_admin = 1
     WHERE conversation_id = ? AND sender = 'practitioner' AND read_by_admin = 0`,
    [conversationId]
  );
}

export async function markConversationReadByPractitioner(conversationId: number): Promise<void> {
  await run(
    `UPDATE chat_messages SET read_by_practitioner = 1
     WHERE conversation_id = ? AND sender = 'admin' AND read_by_practitioner = 0`,
    [conversationId]
  );
}

export async function setConversationStatus(
  id: number,
  status: ChatStatus
): Promise<ChatConversation | null> {
  await run(
    `UPDATE chat_conversations SET status = ?, updated_at = datetime('now') WHERE id = ?`,
    [status, id]
  );
  return getConversation(id);
}

/** Total practitioner messages the admin has not yet read, across all conversations. */
export async function adminUnreadCount(): Promise<number> {
  const row = await one(
    `SELECT COUNT(*) AS n FROM chat_messages WHERE sender = 'practitioner' AND read_by_admin = 0`
  );
  return num(row?.n);
}

/** Conversation list for the admin console, most-recent activity first. */
export async function listConversationsForAdmin(
  status?: ChatStatus
): Promise<ChatConversationSummary[]> {
  const rows = await all(
    `SELECT c.*, p.name AS p_name, p.email AS p_email,
       (SELECT body FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
       (SELECT created_at FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
       (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id AND m.sender = 'practitioner' AND m.read_by_admin = 0) AS admin_unread
     FROM chat_conversations c
     JOIN practitioners p ON p.id = c.practitioner_id
     ${status ? 'WHERE c.status = ?' : ''}
     ORDER BY c.updated_at DESC, c.id DESC`,
    status ? [status] : []
  );
  return rows.map((r) => ({
    ...rowToConversation(r),
    practitionerName: r.p_name as string,
    practitionerEmail: r.p_email as string,
    lastMessage: (r.last_body as string | null) ?? null,
    lastMessageAt: (r.last_at as string | null) ?? null,
    adminUnread: num(r.admin_unread),
  }));
}

/**
 * Open conversations awaiting an admin reply (latest message is the practitioner's,
 * older than `minutes`) that have not already been alerted for this wait. Drives the
 * missed-message email backstop.
 */
export async function conversationsAwaitingAlert(minutes: number): Promise<
  (ChatConversation & { practitionerName: string; practitionerEmail: string })[]
> {
  const rows = await all(
    `SELECT c.*, p.name AS p_name, p.email AS p_email
     FROM chat_conversations c
     JOIN practitioners p ON p.id = c.practitioner_id
     WHERE c.status = 'open'
       AND c.last_practitioner_at IS NOT NULL
       AND (c.last_admin_at IS NULL OR c.last_admin_at < c.last_practitioner_at)
       AND c.last_practitioner_at <= datetime('now', ?)
       AND (c.alerted_at IS NULL OR c.alerted_at < c.last_practitioner_at)
     ORDER BY c.last_practitioner_at ASC`,
    [`-${minutes} minutes`]
  );
  return rows.map((r) => ({
    ...rowToConversation(r),
    practitionerName: r.p_name as string,
    practitionerEmail: r.p_email as string,
  }));
}

export async function markConversationAlerted(id: number): Promise<void> {
  await run(`UPDATE chat_conversations SET alerted_at = datetime('now') WHERE id = ?`, [id]);
}

export interface ChatStats {
  totalConversations: number;
  totalMessages: number;
  practitionerMessages: number;
  adminMessages: number;
  openConversations: number;
  uniquePractitioners: number;
  byMonth: { month: string; conversations: number; messages: number }[];
  byWeekday: { weekday: number; messages: number }[];
  byHour: { hour: number; messages: number }[];
  topPractitioners: { practitionerId: number; name: string; messages: number }[];
}

/** Aggregate chat analytics over an optional [from, to] ISO window (practitioner filter optional). */
export async function chatStats(opts: {
  from?: string | null;
  to?: string | null;
  practitionerId?: number | null;
} = {}): Promise<ChatStats> {
  const where: string[] = [];
  const args: InValue[] = [];
  if (opts.from) { where.push(`m.created_at >= ?`); args.push(opts.from); }
  if (opts.to) { where.push(`m.created_at <= ?`); args.push(opts.to); }
  if (opts.practitionerId) { where.push(`c.practitioner_id = ?`); args.push(opts.practitionerId); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const base = `FROM chat_messages m JOIN chat_conversations c ON c.id = m.conversation_id ${clause}`;

  const totals = await one(
    `SELECT
       COUNT(*) AS msgs,
       COUNT(DISTINCT c.id) AS convos,
       COUNT(DISTINCT c.practitioner_id) AS people,
       SUM(CASE WHEN m.sender = 'practitioner' THEN 1 ELSE 0 END) AS p_msgs,
       SUM(CASE WHEN m.sender = 'admin' THEN 1 ELSE 0 END) AS a_msgs,
       SUM(CASE WHEN c.status = 'open' THEN 1 ELSE 0 END) AS open_flag
     ${base}`,
    args
  );
  const openConvos = await one(
    `SELECT COUNT(DISTINCT c.id) AS n
     FROM chat_conversations c
     ${opts.practitionerId ? 'WHERE c.status = \'open\' AND c.practitioner_id = ?' : 'WHERE c.status = \'open\''}`,
    opts.practitionerId ? [opts.practitionerId] : []
  );
  const byMonth = (await all(
    `SELECT strftime('%Y-%m', m.created_at) AS month,
       COUNT(DISTINCT c.id) AS convos, COUNT(*) AS msgs
     ${base} GROUP BY month ORDER BY month ASC`,
    args
  )).map((r) => ({ month: r.month as string, conversations: num(r.convos), messages: num(r.msgs) }));
  const byWeekday = (await all(
    `SELECT CAST(strftime('%w', m.created_at) AS INTEGER) AS wd, COUNT(*) AS msgs
     ${base} GROUP BY wd ORDER BY wd ASC`,
    args
  )).map((r) => ({ weekday: num(r.wd), messages: num(r.msgs) }));
  const byHour = (await all(
    `SELECT CAST(strftime('%H', m.created_at) AS INTEGER) AS hr, COUNT(*) AS msgs
     ${base} GROUP BY hr ORDER BY hr ASC`,
    args
  )).map((r) => ({ hour: num(r.hr), messages: num(r.msgs) }));
  const topPractitioners = (await all(
    `SELECT c.practitioner_id AS pid, p.name AS name, COUNT(*) AS msgs
     FROM chat_messages m
     JOIN chat_conversations c ON c.id = m.conversation_id
     JOIN practitioners p ON p.id = c.practitioner_id
     ${clause ? clause + ' AND' : 'WHERE'} m.sender = 'practitioner'
     GROUP BY c.practitioner_id ORDER BY msgs DESC LIMIT 10`,
    args
  )).map((r) => ({ practitionerId: num(r.pid), name: r.name as string, messages: num(r.msgs) }));

  return {
    totalConversations: num(totals?.convos),
    totalMessages: num(totals?.msgs),
    practitionerMessages: num(totals?.p_msgs),
    adminMessages: num(totals?.a_msgs),
    openConversations: num(openConvos?.n),
    uniquePractitioners: num(totals?.people),
    byMonth,
    byWeekday,
    byHour,
    topPractitioners,
  };
}

/** All practitioner messages in an optional window — feeds the AI FAQ consolidation. */
export async function practitionerChatMessages(opts: {
  from?: string | null;
  to?: string | null;
  limit?: number;
} = {}): Promise<{ id: number; body: string; createdAt: string; practitionerId: number }[]> {
  const where: string[] = [`m.sender = 'practitioner'`];
  const args: InValue[] = [];
  if (opts.from) { where.push(`m.created_at >= ?`); args.push(opts.from); }
  if (opts.to) { where.push(`m.created_at <= ?`); args.push(opts.to); }
  const rows = await all(
    `SELECT m.id, m.body, m.created_at, c.practitioner_id AS pid
     FROM chat_messages m JOIN chat_conversations c ON c.id = m.conversation_id
     WHERE ${where.join(' AND ')} ORDER BY m.id DESC LIMIT ?`,
    [...args, opts.limit ?? 1000]
  );
  return rows.map((r) => ({
    id: num(r.id),
    body: r.body as string,
    createdAt: r.created_at as string,
    practitionerId: num(r.pid),
  }));
}
