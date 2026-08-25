# Saved items / "My Clinic" — design

Status: **approved 2026-08-25**. Branch `feat/saved-items`, off `cloudflare-migration`
@ `5de6544` (the brand reskin was fast-forwarded in first, so this builds on the new
UI primitives rather than being restyled twice).

Fills the deck's *My Clinic* nav slot — see `docs/DECK_GAP_ANALYSIS.md` §4 ("no
bookmark/save model at all") and §7 for the decisions this sits under.

## 1. What this is

A practitioner can save a clinical toolkit item, a resource, or a lesson, and find
everything they saved on one page. That is the whole feature.

**Saveable:** `toolkit_resources`, `media`, `lessons`.
**Not saveable:** pathways and events — `/cpd` already tracks pathway progress and
`hub_event_registrations` already models event attendance. A second, weaker signal
over the same thing would confuse both.

**No folders, no tags, no per-item notes.** A flat list grouped by type. Folders are an
additive migration if practitioners ask; notes raise a "is this a clinical record?"
question that must not be answered by accident.

## 2. Data model

Migration `019_saved_items` in `lib/migrations.ts`:

```sql
CREATE TABLE IF NOT EXISTS saved_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  item_type TEXT NOT NULL,          -- 'toolkit' | 'media' | 'lesson'
  item_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(practitioner_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_items_practitioner ON saved_items(practitioner_id);
```

**One polymorphic table, not three.** This follows the `pathway_modules`
`(content_kind, content_id)` precedent already in the schema. Three per-type tables
would buy foreign-key integrity that the read path already provides via its joins, at
3x the code and a fourth table every time a content type is added.

**`item_type`, not `content_kind`** — deliberately. `content_kind` already means the
*payload* kind (`file`/`link`/`text`) on `toolkit_resources` and `media`, and the
*entity* kind (`lesson`/`media`) on `pathway_modules`. A third meaning on a new table
would make the codebase harder to read, not easier.

**Accepted trade-off:** no FK on `item_id`, so a deleted item leaves an orphan row.
The read path drops orphans (§3). This is the same trade `pathway_modules` makes.

`tests/migrations.test.ts` needs no change — it asserts the recorded set equals
`MIGRATIONS`, so `019` is covered the moment it is added.

## 3. Server layer

Four helpers in `lib/db.ts`, mirroring the `registerForEvent` group:

| Helper | Behaviour |
|---|---|
| `saveItem(practitionerId, itemType, itemId)` | `INSERT … ON CONFLICT DO NOTHING` — double-tap is harmless |
| `unsaveItem(practitionerId, itemType, itemId)` | `DELETE`; unsaving something unsaved is a no-op, not an error |
| `savedItemRefs(practitionerId)` | `{itemType, itemId}[]` — lights up toggles on list pages |
| `listSavedItems(practitionerId, qualificationStatus)` | hydrated rows, three joins |

`listSavedItems` enforces two rules, and they are the substance of this design:

1. **Orphans and unpublished items are dropped by the join.** An item deleted or
   unpublished after being saved simply does not render. No error, no broken card.
2. **Audience gating is re-applied on read, never trusted from save time.**
   `toolkit_resources` and `media` carry `audience` (`all`/`qualified`/`student`).
   If a practitioner's `qualificationStatus` changes, qualified-only saves must stop
   being visible. Gating only at save time would leak gated content indefinitely.

## 4. API

One route: `app/api/me/saved/route.ts`, behind the standard `getSessionPractitioner`
+ `status === 'approved'` guard used by every other `/api/me/*` route.

- `GET` → `{ refs, items }` — refs for list pages, hydrated items for My Clinic
- `POST` `{ itemType, itemId }` → save. **Validates `itemType` against the three
  allowed values and 400s otherwise** — no arbitrary strings in the column.
- `DELETE` `{ itemType, itemId }` → unsave

No secrets, no external calls: this feature has no keyed path, so mock-until-keyed
holds trivially.

## 5. UI

- **`components/SaveButton.tsx`** — `{ itemType, itemId, saved, onToggle }`. Bookmark
  outline → filled, `aria-pressed`, "Save to My Clinic" / "Saved". Optimistic, and
  **reverts on a failed request** so the icon cannot lie about what is stored.
- **Three existing list pages** each fetch `/api/me/saved` once on mount into a `Set`
  of `"type:id"` keys. Insertion points: `ResourceCard` (`ToolkitApp.tsx:127`),
  `MediaCard` (`ResourcesApp.tsx:61`), lesson card (`LibraryApp.tsx:181`).
  **This is why refs are a separate endpoint:** the response shapes of
  `/api/me/toolkit`, `/api/resources` and `/api/library` are untouched, so
  `api-resources.test.ts` and `api-library.test.ts` are undisturbed.
- **`app/my-clinic/page.tsx` + `components/MyClinicApp.tsx`** — thin page delegating to
  a client app, as every other route here does. Three `SectionTitle` blocks
  (Toolkit / Resources / Lessons), a `Card` per item with an unsave, built on the
  reskin primitives in `components/ui/index.tsx`. The `Empty` primitive covers the
  day-one empty state and points at the three source pages — every practitioner sees
  that state first and it must not look broken.
- **Nav** — one entry in `PRACTITIONER_NAV` (`app/layout.tsx:20`) plus a `/my-clinic`
  icon in `ICONS` (`SideNav.tsx:14`). The map falls back to `BookOpen`, so a missing
  icon degrades rather than breaks.

## 6. Tests

TDD — failing test first. No component-test infrastructure exists here (99 test files,
all db/API level, no testing-library or jsdom) and **this branch does not introduce
any**; that is a separate decision, not a rider on a feature.

**`tests/saved-items-db.test.ts`**
- `019` creates `saved_items`
- save is idempotent — saving twice yields one row
- unsave removes; unsaving something never saved is a no-op
- `savedItemRefs` returns only that practitioner's rows (cross-practitioner isolation)
- `listSavedItems` omits an item unpublished after saving
- `listSavedItems` omits an orphan whose underlying row was deleted
- `listSavedItems` re-applies audience gating when `qualificationStatus` changes

**`tests/api-me-saved.test.ts`**
- 401 unauthenticated, and 401 for a non-`approved` practitioner
- 400 on an `itemType` outside the three allowed values
- POST → GET reflects the save; DELETE → GET reflects the removal

## 7. Gates

`npm test` (437 → ~450) and `npm run build`, **plus `npm run preview:cf`** — mandatory
here: this adds a migration and an API route, and `019` must be proven to apply in real
workerd against local D1, not only in the vitest harness.

## 8. Explicitly out of scope

- The **nav regroup** (Practice Growth / My Clinic sections) — its own branch, next.
  It needs section headers in `SideNav`, which is a real component change.
- Tags, folders, per-item notes
- Admin visibility into what is being saved
- Surfacing saved items on the Dashboard
