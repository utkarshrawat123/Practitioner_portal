# Part 3 — Learning Pathways & CPD Certificates — Design

**Date:** 2026-07-16 · Branch `part-3-pathways` · Built autonomously (user asleep, authorized to decide).
**Builds on:** Part 1 tables `pathways`, `pathway_modules`, `certificates`; existing `lessons`,
`media`, `lesson_completions`; `hasAccess`; Vercel Blob.

## Goal
Turn the flat lesson library into structured, multi-module **Learning Pathways** with progress
tracking and real downloadable **CPD certificates**, plus an admin **Pathway Builder**.

## Decisions (made autonomously — best for roadmap)
1. **Migration 009** adds to `pathways`: `category TEXT` (one of the 8 deck categories) and
   `cpd_hours REAL NOT NULL DEFAULT 0`. Adds new table `module_completions`
   `(id, practitioner_id, module_id, completed_at, UNIQUE(practitioner_id, module_id))`.
2. **8 categories** (fixed catalogue): Women's Health, Hormone Health, Gut Health, Immune Health,
   Children's Health, Joint Health, Heart Health, Brain Health. Stored as `pathways.category`.
3. **Module completion source of truth = union**: a module is complete for a practitioner if
   (a) an explicit `module_completions` row exists, OR (b) it is a `lesson` module whose lesson is
   already in `lesson_completions` (so library progress counts automatically). Computed in code.
4. **Progress** = required-and-complete modules ÷ total required modules (0 required ⇒ 0%).
   A pathway is **complete** when every required module is complete.
5. **Certificate issuance**: on marking a module complete, if the pathway just reached 100% required
   and no certificate exists, generate a PDF and insert a `certificates` row (idempotent via the
   UNIQUE(practitioner_id, pathway_id)). Certificates never regenerate.
6. **PDF = `pdf-lib`** (pure JS, serverless-safe; no headless browser). A5 landscape, brand colours
   (ink/forest/terracotta text on cream), fields: practitioner name, pathway title, CPD hours,
   completion date, WN wordmark. Uploaded to Vercel Blob via `@vercel/blob` `put`; `pdf_url` stored.
   Tests mock the Blob upload + pdf bytes.
7. **Audience gating** via `hasAccess` on every pathway (pathways carry `audience` from Part 1).
8. **Continue Learning** homepage card swaps from the lesson-count stub to the practitioner's
   most-recently-progressed in-progress pathway (falls back to lesson count if none).

## Data layer (`lib/db.ts`)
Types: `Pathway`, `PathwayInput`, `PathwayModule`, `ModuleInput`, `Certificate`, `PathwayProgress`.
Helpers:
- Pathways CRUD: `createPathway`, `getPathway`, `listPathways` (admin, all), `listPublishedPathways`
  (published only), `updatePathway`, `deletePathway`.
- Modules: `addPathwayModule`, `listPathwayModules(pathwayId)`, `updatePathwayModule`,
  `deletePathwayModule`, `reorderHandled via position update`.
- Completion: `markModuleComplete(practitionerId, moduleId)`, `moduleCompletionIds(practitionerId)`.
- Progress: `pathwayProgress(practitionerId, pathwayId)` → `{ total, required, completedRequired,
  percent, complete }`; `allPathwayProgress(practitionerId)` for /cpd + Continue Learning.
- Certificates: `getCertificate(practitionerId, pathwayId)`, `listCertificates(practitionerId)`,
  `issueCertificate(...)` (insert row; called by the cert service after PDF upload).

## Certificate service (`lib/certificates.ts`)
`maybeIssueCertificate(practitioner, pathway)`: recompute progress; if complete && no existing cert →
`generateCertificatePdf()` (pdf-lib) → `put()` to Blob → `issueCertificate()`. Returns the cert or null.
`generateCertificatePdf(name, pathwayTitle, cpdHours, date)` → `Uint8Array`. Pure, unit-testable.

## Routes & pages
- `/learning` (`app/learning/page.tsx` replaces the ComingSoon stub) → server-gated; client
  `LearningCatalogue` fetches `GET /api/me/pathways` → pathways grouped by the 8 categories with a
  progress ring per card.
- `/learning/[id]` → `PathwayDetail` fetches `GET /api/me/pathways/[id]`: ordered modules with
  status icon (complete / available / — ), % bar, "Open" (→ lesson/media) + "Mark complete", and a
  "Download certificate" CTA once complete.
- `/cpd` (`app/cpd/page.tsx`) → `CpdApp` fetches `GET /api/me/cpd`: certificates earned (download
  links) + progress across all pathways. Quick Link "My CPD" now points here.
- Admin **Pathways** tab (`components/AdminPathways.tsx`, 10th tab): create/edit pathway
  (title, description, category, cpd_hours, audience, publish), add/reorder/remove modules from
  published lessons + media, required toggle.

## APIs (all `dynamic='force-dynamic'`, zod, standard guards)
- Practitioner (`getSessionPractitioner` + approved):
  - `GET /api/me/pathways` → published pathways (audience-filtered) + progress each.
  - `GET /api/me/pathways/[id]` → pathway + modules (resolved lesson/media titles) + progress.
  - `POST /api/me/pathways/[id]/complete` `{ moduleId }` → mark module complete, maybe issue cert,
    return updated progress + certificate.
  - `GET /api/me/cpd` → certificates + all progress.
- Admin (`isAuthed`):
  - `GET/POST /api/admin/pathways`; `GET/PATCH/DELETE /api/admin/pathways/[id]`.
  - `POST /api/admin/pathways/[id]/modules` (add), `PATCH/DELETE /api/admin/pathways/[id]/modules/[moduleId]`.
  - `GET /api/admin/pathways/content` → published lessons + media to pick from.

## Testing (TDD, keep suite green)
Migration 009 (columns + module_completions, data intact); pathway/module CRUD; progress calc
(lesson-completion union, required-only, 100% ⇒ complete); `maybeIssueCertificate` (issues once,
idempotent, mocked Blob + pdf); certificate PDF generator returns non-empty PDF bytes starting `%PDF`;
practitioner + admin route auth + happy paths; audience filtering on catalogue.

## Out of scope
Real lesson content (placeholder until AI/content phase); AI generation (Gemini, Part 4).
