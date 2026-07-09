# Educational Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Claude pipeline that turns raw source files into draft microlearning lessons in a human review queue (with clinical-claim flagging), plus a practitioner-gated library with topic browse/search, quiz self-check, mark-complete CPD tracking, and a dashboard count.

**Architecture:** Offline `scripts/generate-lessons.ts` reads `content-sources/`, calls Claude (structured output, injectable), writes `status:'draft'` lessons. Admin "Lessons" tab edits/approves. `/library` shows published lessons with search/filter, quiz, and completion toggle. Dashboard count via existing `/api/me/stats`.

**Tech Stack:** Existing app + `@anthropic-ai/sdk` (installed). Model `claude-opus-4-8`.

**Spec:** `docs/superpowers/specs/2026-07-09-educational-hub-design.md`

## Global Constraints

- Generation offline only; never in a request path. Script needs `ANTHROPIC_API_KEY`.
- Only `status:'published'` lessons reach practitioners. Pipeline writes `draft` only.
- Claim safety: model `claim_flags[]` + deterministic `scanClaims` both surfaced to reviewer.
- Topic slugs from `lib/lessons/topics.ts`; unknown → `general` + a claim/topic flag.
- Tests never call the real API: inject a fake `complete`; route tests stub `fetch`.
- Sample source files carry `SAMPLE — replace with real source material.`
- Brand tokens/classes match existing `AdminDashboard.tsx` / `DashboardApp.tsx`.

---

### Task 1: Topics + claim scanner + source loader

**Files:** Create `lib/lessons/topics.ts`, `lib/lessons/claims.ts`, `lib/lessons/sources.ts`. Test `tests/lessons-lib.test.ts` (+ `tests/fixtures/sources/`).

**Interfaces (produced):**
```ts
// topics.ts
const TOPICS: { slug: string; label: string }[];  // 12 per spec
normaliseTopic(raw: string): string;  // known slug or 'general'
isKnownTopic(slug: string): boolean;
// claims.ts
scanClaims(text: string, sourceText: string): string[];  // deterministic extra flags
// sources.ts
interface SourceDoc { file: string; text: string }
loadSources(dir: string): Promise<SourceDoc[]>;  // md/txt sync; .pdf via dynamic import; skip empty
```
`scanClaims`: for each claim keyword (`treat`, `cure`, `prevent`, `reverse`, `clinically proven`, `guaranteed`, `diagnos`), if present in `text` but the surrounding claim word is absent from `sourceText` (case-insensitive), push `Unsupported claim language "<kw>" not found in source`. Normalise both to lowercase before comparing.

TDD: TOPICS has 12 entries incl. `hormones`/`gut-health`/`iron-deficiency`/`general`; `normaliseTopic('Hormones')`→`hormones`, `normaliseTopic('quantum')`→`general`; scanClaims flags "cures anxiety" when source lacks "cure", returns [] when source contains the claim word; loadSources reads a `.md` + `.txt`, skips an empty file, returns file+text.

Commit: `feat: lesson topic registry, deterministic claim scanner, source loader`

### Task 2: Lesson generator (`lib/lessons/generate.ts`)

**Interfaces:**
```ts
interface Quiz { question: string; options: string[]; correctIndex: number; explanation: string }
interface DraftLesson { title: string; summary: string; takeaways: string[]; quiz: Quiz;
  topics: string[]; claim_flags: string[] }
interface Completion { output: unknown; usage: {inputTokens:number; outputTokens:number}|null }
type CompleteFn = (systemRules: string, sourceText: string) => Promise<Completion>
class LessonError extends Error {}
isConfigured(): boolean
generateLessons(source: {file:string; text:string}, complete?: CompleteFn)
  : Promise<{ lessons: DraftLesson[]; usage: Completion['usage'] }>
```
Validates model output with zod against `{lessons:[...]}`; each lesson: topics mapped through `normaliseTopic` (dedup; push a claim flag when a raw topic was unknown), and `claim_flags` = model flags ++ `scanClaims(summary+takeaways.join, source.text)`. Malformed → `LessonError`. Default `complete` = Anthropic `messages.create` (model `claude-opus-4-8`, adaptive thinking, `output_config.format` json_schema, source as the user message, system rules instruct grounding + per-claim flagging + 1–4 lessons + controlled topics + one MCQ quiz).

TDD (`tests/lessons-generate.test.ts`, inject fake complete): happy path → validated lessons; model claim_flags preserved AND deterministic flag merged when summary has an untraceable "cure"; unknown raw topic → `general` + flag; malformed output → throws LessonError.

Commit: `feat: grounded lesson generator with claim-flag merging`

### Task 3: DB — lessons + completions

**Interfaces (lib/db.ts):**
```ts
interface LessonRow { id; sourceFile; title; summary; takeaways:string[]; quiz:Quiz;
  topics:string[]; claimFlags:string[]; status; model; inputTokens; outputTokens; createdAt; decidedAt }
insertLesson(l:{sourceFile;title;summary;takeaways;quiz;topics;claimFlags;model?;inputTokens?;outputTokens?}): number
listLessons(status?): LessonRow[]                 // newest first
getLesson(id): LessonRow | null
updateLessonFields(id, f:{title;summary;takeaways;quiz;topics}): void
setLessonStatus(id, status:'published'|'rejected'|'draft'): LessonRow
listPublishedLessons(opts?:{topic?;q?}): LessonRow[]
toggleCompletion(practitionerId, lessonId): boolean   // returns new completed state; false if lesson not published
completedLessonIds(practitionerId): number[]
countCompletions(practitionerId): number
```
Two `CREATE TABLE IF NOT EXISTS` blocks per spec. `toggleCompletion` no-ops→false if the lesson isn't published or doesn't exist; otherwise insert-or-delete on the unique pair. `listPublishedLessons` filters status='published', optional topic (JSON contains slug), optional `q` LIKE over title/summary/takeaways_json.

TDD (`tests/lessons-db.test.ts`): insert→getLesson round-trips JSON fields; listLessons newest-first + status filter; updateLessonFields + setLessonStatus('published'); listPublishedLessons excludes drafts, filters by topic and by q; toggleCompletion twice flips true→false and count 1→0; toggling an unpublished lesson returns false and stays 0; completedLessonIds reflects state.

Commit: `feat: lessons and completions data layer`

### Task 4: Generation script + sample sources

**Files:** `scripts/generate-lessons.ts`, `content-sources/{webinar-hormones.md,formulation-iron.md,case-study-gut.md}`, `package.json` script `"generate-lessons": "tsx scripts/generate-lessons.ts"`, add `tsx` devDep. Test `tests/lessons-script.test.ts`.

Script: if `!isConfigured()` print guidance + exit 1; `loadSources('content-sources')`; per source `generateLessons` then `insertLesson` each (catch per-source, log, continue); print `files, drafts, flags` summary. Extract the run into `runGeneration(dir, deps)` (deps: loadSources, generateLessons, insertLesson, log) so it's testable without the API; the CLI wrapper calls it with real deps + a configured guard.

TDD: `runGeneration` with fake deps over 2 fake sources inserts the right number of drafts, continues past a source whose generate throws, and returns `{files, drafts, flags}`. Sample sources each carry the SAMPLE header and enough content for a realistic lesson.

Commit: `feat: generate-lessons CLI with sample sources`

### Task 5: Admin review routes + tab

**Files:** `app/api/admin/lessons/route.ts` (GET `?status=` → `{lessons}`, admin-gated), `app/api/admin/lessons/[id]/route.ts` (POST `{action, fields?}`: save→updateLessonFields, approve→published, reject→rejected; 404 unknown; 400 bad action; admin-gated), `components/AdminLessons.tsx` + AdminDashboard "Lessons" tab. Test `tests/api-admin-lessons.test.ts`.

TDD: GET 401 unauthed; seed a draft (insertLesson) → authed GET returns it; POST save edits fields; POST approve → status published; POST reject → rejected; 404 unknown id; 400 unknown action. Tab: editable fields + claim-flag banner + Approve/Reject (patterns from AdminDashboard; full code in repo).

Commit: `feat: admin lesson review queue with inline edit and approve/reject`

### Task 6: Library routes + page + dashboard count + verify

**Files:** `app/api/library/route.ts` (GET published + `completedIds`, practitioner-gated), `app/api/library/[id]/complete/route.ts` (POST toggle → `{completed}`; 404 if not published; practitioner-gated), extend `app/api/me/stats/route.ts` + `lib/stats.ts` DashboardStats with `lessonsCompleted`, `app/library/page.tsx` + `components/LibraryApp.tsx`, dashboard "Lessons completed" card + `/library` link. Test `tests/api-library.test.ts` (+ extend stats test).

TDD: library GET 401 unauthed; with session returns only published + caller's completedIds; topic & q filters apply; complete POST toggles and 404s on a draft lesson; `computeStats` includes `lessonsCompleted` from countCompletions. Page: topic chips, search box, lesson cards → detail with interactive quiz + Mark-complete (patterns from DashboardApp; full code in repo).

Verify: `npm test && npm run build`; smoke on live server (library 401 without session, admin lessons 401 without cookie, `runGeneration` covered by tests); merge to main.

Commit: `feat: practitioner library, CPD completion tracking, dashboard count`

## Self-review notes
Coverage: pipeline+claims (T1/T2), draft-only write + review/approve (T3/T5), quiz interactive (schema T2, UI T6), CPD toggle+count (T3/T6), topic browse/search (T3/T6), claim flagging surfaced (T2/T5). Types cross-checked (DraftLesson/Quiz/LessonRow/CompleteFn). UI-code-in-repo deviation noted, executor is this session.
