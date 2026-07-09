# Educational Hub — Design Spec

**Date:** 2026-07-09
**Status:** Approved by user
**Extends:** practitioner-portal (onboarding, dashboard, AI assistant specs)

## Problem

Wild Nutrition's practitioner community has no live educational hub. We need a
content pipeline that turns raw source material (webinar transcripts, consultation
notes, formulation-science docs, case studies) into structured microlearning
lessons via Claude — output to a human review queue, never auto-published, with
clinical claims flagged when not traceable to the source — plus a practitioner-
gated content library with topic browse/search, mark-complete CPD tracking, and a
completed-lessons count on the dashboard.

## Confirmed decisions

| Decision | Choice |
|---|---|
| Source input | CLI script (`npm run generate-lessons`) over `content-sources/` (markdown/txt direct; PDF text-extracted). 3 sample sources seeded. Generation stays offline — never in a web request. |
| Model | Claude API `claude-opus-4-8`, adaptive thinking, structured outputs. Needs `ANTHROPIC_API_KEY`; library/review/tracking all work without it. |
| Review flow | Pipeline writes `status:'draft'`. Admin "Lessons" tab: inline-edit every field, then Approve → `published` or Reject. Only `published` lessons reach practitioners. |
| Quiz | Interactive multiple-choice self-check: `question`, `options[]`, `correctIndex`, `explanation`. |
| CPD | Manual "Mark as complete" toggle per practitioner; dashboard shows "Lessons completed: N". |
| Claim safety | Model emits `claim_flags[]` for clinical claims not traceable to source; a deterministic post-scan appends flags for claim-language (treats/cures/prevents/clinically proven/…) not found in the source text. Both surfaced to the reviewer. |

## Topic vocabulary (controlled, extensible)

`hormones`, `gut-health`, `iron-deficiency`, `fertility`, `pregnancy`,
`menopause`, `sleep`, `stress`, `immunity`, `formulation-science`,
`micronutrients`, `general`. Generator must map to these slugs; unknown topics
fall back to `general` and are flagged for the reviewer.

## Architecture (additions to practitioner-portal)

```
content-sources/                  raw source files (+ 3 samples, marked SAMPLE)
scripts/generate-lessons.ts       CLI: read sources → Claude → draft lessons
lib/lessons/sources.ts            loadSources(dir) → {file, text}[] (md/txt/pdf)
lib/lessons/generate.ts           schema, system rules, generateLessons(source, complete?)
lib/lessons/claims.ts             scanClaims(text, sourceText) → extra claim flags
lib/lessons/topics.ts             TOPICS registry + normaliseTopic()
lib/db.ts                         + lessons, lesson_completions tables + accessors
app/api/admin/lessons/route.ts        GET list (any status)
app/api/admin/lessons/[id]/route.ts   POST {action:'save'|'approve'|'reject', fields?}
app/api/library/route.ts              GET published (?topic= &q=) + per-practitioner completed set
app/api/library/[id]/complete/route.ts POST toggle completion
app/api/me/stats                      + lessonsCompleted count (extend existing)
app/library/page.tsx + components/LibraryApp.tsx
components/AdminLessons.tsx        admin review tab
```

`generateLessons` takes an injectable `complete` fn (default = real Anthropic
SDK call) so tests run without the API; the script uses the default.

## Data model

```sql
lessons (
  id INTEGER PK, source_file TEXT, title TEXT, summary TEXT,
  takeaways_json TEXT, quiz_json TEXT, topics_json TEXT, claim_flags_json TEXT,
  status TEXT DEFAULT 'draft',        -- draft | published | rejected
  model TEXT, input_tokens INTEGER, output_tokens INTEGER,
  created_at TEXT, decided_at TEXT
)
lesson_completions (
  id INTEGER PK, practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  completed_at TEXT DEFAULT (datetime('now')),
  UNIQUE(practitioner_id, lesson_id)
)
```

Quiz JSON shape: `{question, options:[string], correctIndex:number, explanation}`.

## Generation flow (per source file)

1. `loadSources` yields `{file, text}` (PDF → text via pdf extraction; skip empty).
2. `generateLessons` calls the model with system rules + source text, structured
   output = `{ lessons: [{title, summary, takeaways[3-5], quiz, topics[], claim_flags[]}] }`,
   1–4 lessons per source.
3. `scanClaims(summary + takeaways, sourceText)` appends deterministic flags.
4. `normaliseTopic` maps each topic to a known slug (else `general` + flag).
5. Each lesson inserted `status:'draft'` with source_file, flags, usage.
Script prints a summary (files processed, drafts created, total flags) and never
publishes. Re-runnable; duplicate detection out of scope (reviewer dedupes).

## Review workflow (/admin "Lessons" tab)

- List drafts (and published/rejected) with status + flag count.
- Detail: editable title/summary/takeaways/quiz/topics; a terracotta banner lists
  claim flags. `save` persists edits; `approve` → published; `reject` → rejected.
- Lesson audit events reuse the existing `events`-style logging pattern (new rows
  in a lightweight `events`-like log are out of scope; decided_at/status suffice).

## Practitioner library (/library, session-gated)

- `GET /api/library?topic=&q=`: published lessons, optional topic slug filter and
  case-insensitive text match over title/summary/takeaways; returns each lesson +
  the caller's completed lesson-id set.
- Lesson view: summary, takeaways, interactive quiz (select → correct/incorrect +
  explanation), "Mark as complete" toggle.
- `POST /api/library/:id/complete`: toggles the completion row (insert/delete),
  returns new state. Only published lessons are completable.
- Dashboard: "Lessons completed" stat from `countCompletions(practitionerId)`,
  surfaced via the existing `/api/me/stats` response; library link added.

## Error handling

- No API key → script exits with a clear message; nothing written. Library/review
  unaffected (they don't call the model).
- Malformed model output → that source is skipped with a logged error; other
  sources still process.
- Completing an unpublished/nonexistent lesson → 404.
- All admin routes admin-gated (401), all library routes practitioner-gated (401).

## Testing (Vitest, TDD; no real API calls)

sources loader (md/txt, empty skip), topics normalisation, claim scanner
(catches "cures anxiety" absent from source; passes traceable claim),
generateLessons with injected fake completions (happy path, model claim_flags
preserved + deterministic flags merged, unknown-topic fallback, malformed →
throws), lessons + completions DB (insert, publish, list published, unique
completion toggle, count), admin lessons routes (gating, save/approve/reject),
library routes (gating, topic+search filter, complete toggle, 404 on unpublished),
dashboard count in stats.

## Out of scope (YAGNI)

- Real curriculum content (samples only, clearly marked).
- Admin upload UI (script only; could layer on later).
- Certificates/CPD hour values, lesson ordering/prerequisites, media embedding,
  duplicate-source detection.
