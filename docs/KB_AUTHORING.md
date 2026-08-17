# Authoring the AI knowledge base

The "Ask the Expert" assistant is grounded **exclusively** in the documents under
`knowledge/`. It has no other source of clinical truth: `SYSTEM_RULES` in
`lib/ai/assistant.ts` forbids it from recommending a product that has no dossier,
from quoting a dose that is not in a dossier, and from adding clinical claims
from its own memory.

That makes `knowledge/` a clinical surface, not a content folder. Everything below
is enforced by `npm test` so a malformed or unapproved dossier cannot ship quietly.

## Current status

All 7 documents are **AWAITING APPROVAL** — drafted from public
wildnutrition.com product information for pipeline testing. They are structurally
valid but **not cleared for live practitioner use**. Replacing them with
signed-off clinical dossiers is the remaining work; the pipeline itself is done.

## Layout

```
knowledge/
  products/                 one dossier per product  (isProduct: true)
    iron-plus.md
    ...
  contraindications.md      clinical guides          (isProduct: false)
  dosing-principles.md
```

`loadKnowledgeBase()` reads `knowledge/products/*.md` then `knowledge/*.md`, both
sorted by filename. **Only these two levels are read** — a deeper subdirectory is
silently ignored. The filename (minus `.md`) becomes the document `id`; the H1
becomes the `title`, which is the exact string the assistant cites.

## Product dossier template

```markdown
# Iron Plus (Food-Grown®)

> **Clinical review:** AWAITING APPROVAL — not for live practitioner use.
> Drafted from public wildnutrition.com product information for pipeline testing only.

## Key ingredients
Food-Grown® iron providing 20mg elemental iron per capsule, with vitamin C...

## Label dosing
1 capsule daily, taken with or after food.

## Mechanism & evidence notes
Iron contributes to normal formation of red blood cells... (EFSA authorised claims).

## Cautions & interactions
- Reduces absorption of levothyroxine — separate by 2–4 hours.
- Contraindicated in haemochromatosis.
```

All four `##` sections are **required and must be non-empty** for product
dossiers, because each backs a specific prompt rule:

| Section | Why the prompt needs it |
|---|---|
| `Key ingredients` | what the product actually contains |
| `Label dosing` | quoted **verbatim**; the assistant may never scale or invent a dose |
| `Mechanism & evidence notes` | the only permitted source of clinical claims |
| `Cautions & interactions` | feeds `safety_flags` and the referral logic |

Clinical guides (non-product) need only an H1 and a review marker.

## The clinical-review marker

Every document must carry exactly one:

```markdown
> **Clinical review:** AWAITING APPROVAL — not for live practitioner use.
> **Clinical review:** APPROVED 2026-09-01 — Wild Nutrition clinical team.
```

This is a **positive** marker, deliberately: a document cannot become silently
unapproved by deleting a warning line, because a missing marker fails validation.

**Go-live gate:** `docsAwaitingClinicalApproval()` must return an empty list
before the assistant is used with real practitioners. Today it returns all 7, and
`tests/kb-contract.test.ts` asserts that — so when real dossiers land, that
assertion is the one to flip.

## Adding or changing a document

1. Write or edit the markdown under `knowledge/`, following the template.
2. **Re-bundle** — the Workers runtime has no filesystem and reads only the
   committed bundle:
   ```bash
   npm run bundle-kb
   ```
3. Commit `lib/ai/kb.bundle.json` alongside your markdown change.
4. `npm test` — `tests/kb-sync.test.ts` fails if you skipped step 2, and
   `tests/kb-contract.test.ts` fails if the dossier breaks the contract.

Forgetting step 2 is the dangerous mistake: dev (`npm run dev`) reads from disk
and looks correct, while production serves the stale bundle. That is exactly what
the sync test exists to catch.

## Size budget

The assistant sends the **entire** knowledge base with every query — there is no
retrieval step — so KB size is per-query token cost. `KB_SIZE_WARN_CHARS`
(300,000) is both the loader's warning threshold and a test assertion. Crossing it
means moving to per-query retrieval rather than raising the number.

Current size: ~8.5k chars across 7 documents.

## Newlines

`knowledge/**/*.md` and the bundle are pinned to LF via `.gitattributes`, and both
the loader and `scripts/bundle-kb.mjs` normalise CRLF on read. Without this, a
Windows checkout (`core.autocrlf=true`) produces a bundle whose every content
string differs from the same content bundled on macOS.
