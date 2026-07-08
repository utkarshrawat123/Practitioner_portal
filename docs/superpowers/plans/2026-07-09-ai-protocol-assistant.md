# AI Protocol Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude-powered protocol assistant for logged-in practitioners: client profile in → KB-grounded protocol + printable branded handout out, with a three-net safety layer and a full admin audit trail.

**Architecture:** Markdown KB loaded whole into the system prompt (cache breakpoint). Pure modules in `lib/ai/` (kb, safety, assistant with injectable completion fn, handout). New `ai_queries` table. One practitioner-gated API route, one admin audit route, one `/assistant` page, one admin tab.

**Tech Stack:** Existing app + `@anthropic-ai/sdk`. Model `claude-opus-4-8`, adaptive thinking, `output_config.format` json_schema structured outputs, prompt caching on the KB block.

**Spec:** `docs/superpowers/specs/2026-07-09-ai-protocol-assistant-design.md`

## Global Constraints

- Grounding: model may ONLY recommend products present in `knowledge/products/*.md`; dosing quoted verbatim from dossiers; post-validation strips non-KB products into `groundingWarnings`.
- Safety: deterministic pre-screen runs before every model call; flags stored and passed to the model; uncertain/contraindicated → defer to clinical judgement / technical support, never guess.
- Every request outcome (ok / out_of_scope / error) is written to `ai_queries`.
- No `ANTHROPIC_API_KEY` → API 503 `{error:"not_configured"}`; UI shows setup notice.
- All handout dynamic content HTML-escaped. Brand tokens only.
- Sample KB files must carry the header line: `> **SAMPLE — replace with approved clinical content before live use.**`
- Tests must not call the real API: unit tests inject a fake `complete`; the route test stubs global `fetch`.

---

### Task 1: Sample KB + loader (`lib/ai/kb.ts`)

**Files:** Create `knowledge/products/{magnesium,iron,ashwagandha,omega-3,food-grown-multi-women}.md`, `knowledge/contraindications.md`, `knowledge/dosing-principles.md`, `lib/ai/kb.ts`. Test `tests/ai-kb.test.ts` (+ fixture dir `tests/fixtures/kb/`).

**Interfaces (produced):**
```ts
interface KbDocument { id: string; title: string; content: string; isProduct: boolean }
interface KnowledgeBase { documents: KbDocument[]; productTitles: string[]; combinedText: string; totalChars: number }
loadKnowledgeBase(dir?: string): KnowledgeBase   // caches per dir; KB_DIR env override
clearKbCacheForTests(): void
isKnownProduct(name: string, kb: KnowledgeBase): boolean  // normalised contains-match both ways, min 4 chars
```
Dossier format: `# <Product Name>` first heading = title; sections: Key ingredients, Label dosing, Mechanism & evidence notes, Cautions & interactions. `combinedText` joins docs as `=== <title> ===\n<content>`.

TDD: fixture KB with 2 products → titles/productTitles/combined assertions; `isKnownProduct("Magnesium", kb)` true vs `WN Magnesium (Food-Grown®)` title; unknown false; cache cleared between tests. Then write the 7 real sample files (SAMPLE header each) and assert the real `knowledge/` loads with ≥5 products.

Commit: `feat: sample knowledge base and KB loader with product grounding index`

### Task 2: Safety pre-screen (`lib/ai/safety.ts`)

**Interfaces:** `interface SafetyFlag { type: 'PREGNANCY'|'MEDICATION'|'MINOR'|'SERIOUS_CONDITION'; detail: string }`; `screenForRisks(profile: string): SafetyFlag[]` — regex rule table per spec. Test `tests/ai-safety.test.ts`: canonical profile "35F, perimenopausal, low ferritin, insomnia, vegetarian" → `[]`; pregnant/breastfeeding/TTC → PREGNANCY; warfarin/SSRI/levothyroxine/"on medication" → MEDICATION; "16 years old"/teenager → MINOR; cancer/CKD/liver disease → SERIOUS_CONDITION; multiple flags accumulate.

Commit: `feat: deterministic clinical safety pre-screen`

### Task 3: Assistant core (`lib/ai/assistant.ts`) + handout (`lib/ai/handout.ts`) + db

**Interfaces (produced):**
```ts
// assistant.ts
interface AssistantOutput { status: 'ok'|'out_of_scope'; out_of_scope_reason: string;
  safety_flags: {type:string; detail:string; recommendation:string}[];
  protocol: {product:string; dose:string; rationale:string; evidence_notes:string; kb_source:string}[];
  general_notes: string; handout: {intro:string; explanation:string; lifestyle_notes:string} }
interface Completion { output: unknown; usage: {inputTokens:number; outputTokens:number} | null }
type CompleteFn = (systemRules: string, kbText: string, userText: string) => Promise<Completion>
isConfigured(): boolean
generateProtocol(profile: string, kb: KnowledgeBase, flags: SafetyFlag[], complete?: CompleteFn)
  : Promise<{ output: AssistantOutput; groundingWarnings: string[]; usage: Completion['usage'] }>
// throws AssistantError('malformed_output') on schema-invalid model output
// handout.ts
renderHandout(input: { practitionerName: string; code: string; link: string; output: AssistantOutput }): string
// db.ts additions
recordAiQuery(q: { practitionerId; profileInput; status; safetyFlags; output?; groundingWarnings?; model?; inputTokens?; outputTokens? }): number
listAiQueries(limit?): AiQueryRow[]   // parsed JSON fields, newest first
```
Default `complete` uses `new Anthropic()` → `client.messages.create({ model:'claude-opus-4-8', max_tokens:8000, thinking:{type:'adaptive'}, system:[{type:'text',text:systemRules},{type:'text',text:kbText,cache_control:{type:'ephemeral'}}], output_config:{format:{type:'json_schema', schema:OUTPUT_SCHEMA}}, messages:[{role:'user',content:userText}] })`, parses first text block as JSON. Output validated with a zod schema mirroring OUTPUT_SCHEMA; protocol filtered through `isKnownProduct`. Handout: standalone HTML, brand palette/fonts inline, print CSS, escaped, includes practitioner name, code, referral link, disclaimer.

TDD (`tests/ai-assistant.test.ts`, `tests/ai-handout.test.ts`, `tests/ai-queries-db.test.ts`): happy path via fake complete; ungrounded product stripped + warned; out_of_scope passthrough with empty protocol; malformed output throws AssistantError; handout contains code/link/disclaimer and escapes `<script>`; ai_queries round-trip incl. JSON fields and newest-first ordering.

Commit: `feat: grounded protocol generation, handout renderer, ai_queries audit table`

### Task 4: Routes + UI + admin tab + verification

**Files:** `app/api/assistant/route.ts` (POST: session-gate approved → 503 if !isConfigured → zod profile 10–2000 chars → screen → load KB → generateProtocol → recordAiQuery → `{output, groundingWarnings, handoutHtml}`; errors logged with status 'error' → 500), `app/api/admin/ai-queries/route.ts` (GET admin-gated `{queries}`), `app/assistant/page.tsx` + `components/AssistantApp.tsx` (login gate, textarea+Generate, flag banner, protocol cards, handout iframe srcDoc + print button, not-configured notice), `components/AdminAiQueries.tsx` + AdminDashboard "AI queries" tab, dashboard link to /assistant, `.env.example` + README updates.

UI follows the exact card/label/button classes of `AdminDashboard.tsx`/`DashboardApp.tsx` (established brand patterns; full code in repo — deviation from inline-code rule as in prior plans, executor is this session).

Test `tests/api-assistant.test.ts`: 401 without session; 503 without key; happy path with `vi.stubGlobal('fetch', ...)` returning an Anthropic-shaped JSON response (content[0].text = valid AssistantOutput JSON) → 200 with handoutHtml containing the practitioner code + audit row written; admin ai-queries route 401/200.

Verify: `npm test && npm run build`, smoke on live server (401, 503 paths — no key present), merge to main.

Commit: `feat: assistant API, practitioner UI, admin AI-query audit tab`

## Self-review notes
Spec coverage: KB+grounding (T1/T3), pre-screen (T2), model rules/schema/out-of-scope (T3), post-validation strip (T3), audit + admin tab (T3/T4), gating + 503 + UI (T4), handout w/ code+disclaimer+escaping (T3/T4). Types cross-checked. UI code-in-repo deviation noted.
