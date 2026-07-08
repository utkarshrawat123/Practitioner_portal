# AI Protocol Assistant — Design Spec

**Date:** 2026-07-09
**Status:** Approved by user
**Extends:** practitioner-portal (onboarding + dashboard specs)

## Problem

Practitioners need AI-suggested Wild Nutrition protocols and client handouts from
a natural-language client profile (e.g. "35F, perimenopausal, low ferritin,
insomnia, vegetarian") — grounded ONLY in a brand knowledge base, never model
memory, with a safety layer, full audit logging, and practitioner-login gating.

## Confirmed decisions

| Decision | Choice |
|---|---|
| Model / API | Claude API, `claude-opus-4-8`, adaptive thinking, structured outputs (`output_config.format` json_schema), TypeScript SDK `@anthropic-ai/sdk` |
| Grounding | Full KB in the system prompt with a prompt-cache breakpoint (KB ≪ context window; no retrieval misses; ~90% cached input cost). Size guard: warn when KB exceeds 300K chars. |
| KB format | Markdown files in `knowledge/` — `products/*.md` dossiers + `contraindications.md` + `dosing-principles.md`. 5 sample dossiers drafted from public product info, each headed "SAMPLE — replace with approved clinical content before live use." |
| Handout | Server-rendered standalone HTML (brand tokens, print stylesheet), previewed in an iframe with a Print / Save-as-PDF button. Auto-includes practitioner name + discount code + referral link + disclaimer. All dynamic text HTML-escaped. |
| API key | `ANTHROPIC_API_KEY` env; absent → `/assistant` shows "not configured", API returns 503 `not_configured`. No mock generation. |
| Gating | `/assistant` + `POST /api/assistant` require the practitioner session (approved only), reusing `getSessionPractitioner`. |
| Audit | Every query (ok, out_of_scope, error) logged to new `ai_queries` table; "AI queries" tab in `/admin` for the Head of Practitioner Education. |

## Safety layer (three independent nets)

1. **Deterministic pre-screen** (`lib/ai/safety.ts`, no AI): regex rules flag
   PREGNANCY (pregnant/breastfeeding/TTC), MEDICATION (named drugs + classes:
   warfarin, SSRIs, levothyroxine, metformin, lithium, methotrexate, chemo,
   immunosuppressants, generic "medication/prescribed"), MINOR (under-18),
   SERIOUS_CONDITION (cancer, renal/hepatic disease, epilepsy, heart failure,
   transplant). Flags are passed to the model and stored in the audit record.
2. **Model-level**: schema forces `safety_flags[]` with a `recommendation`
   string; system rules instruct: recommend only KB products, quote dosing
   verbatim from dossiers, never invent claims or doses, and when uncertain or
   any contraindication risk exists, flag it and default to "use your own
   clinical judgement / contact the Wild Nutrition technical support team".
   Out-of-scope queries (diagnosis requests, acute/emergency, non-supplement)
   → `status: "out_of_scope"` with a reason, no protocol.
3. **Post-validation** (`grounding check`): every `protocol[].product` must
   match a KB product dossier title (normalised contains-match). Non-matching
   items are stripped from the response and recorded as grounding warnings in
   the audit log and surfaced to the practitioner.

## Structured output schema (enforced via output_config.format)

```json
{
  "status": "ok | out_of_scope",
  "out_of_scope_reason": "string (empty when ok)",
  "safety_flags": [{"type": "string", "detail": "string", "recommendation": "string"}],
  "protocol": [{"product": "string", "dose": "string (verbatim from dossier)",
                 "rationale": "string", "evidence_notes": "string", "kb_source": "string"}],
  "general_notes": "string",
  "handout": {"intro": "string", "explanation": "string", "lifestyle_notes": "string"}
}
```

All objects `additionalProperties: false`, all fields required.

## Architecture (additions)

```
knowledge/                      sample KB (markdown)
lib/ai/kb.ts                    loadKnowledgeBase(), isKnownProduct(), cache
lib/ai/safety.ts                screenForRisks(profile) → SafetyFlag[]
lib/ai/assistant.ts             schema, system rules, callClaude (injectable), generateProtocol()
lib/ai/handout.ts               renderHandout() → standalone HTML string (escaped)
lib/db.ts                       + ai_queries table, recordAiQuery/listAiQueries
app/api/assistant/route.ts      POST — gate → screen → generate → validate → log → respond
app/api/admin/ai-queries/route.ts  GET — admin-gated audit list
app/assistant/page.tsx          UI: textarea, Generate, result pane, handout preview/print
components/AssistantApp.tsx
components/AdminAiQueries.tsx   admin audit tab
```

`generateProtocol(profile, kb, flags, complete?)` takes an injectable
`complete` function (defaults to the real Anthropic SDK call) so tests run
without the API; the route-level test stubs global fetch with an
Anthropic-shaped response.

## Error handling

- Missing key → 503 `not_configured` (UI shows setup notice; nothing logged as error).
- Model/API failure or malformed JSON → 500 with friendly message; audit row with `status: "error"`.
- Grounding strip never fails the request — items removed, warnings attached.
- Unauthenticated → 401 → UI links to `/dashboard` login.

## Testing

Vitest: KB loader + product matching, all safety rules (incl. the canonical
no-flag profile), generateProtocol with injected fake completions (happy path,
ungrounded product stripped, out_of_scope passthrough, malformed JSON),
handout rendering (code/link/disclaimer present, HTML escaping), ai_queries
db round-trip, API route gating (401/503) + happy path via fetch stub.

## Out of scope (YAGNI)

- Real clinical KB content (samples only, clearly marked).
- Retrieval infrastructure (embeddings/BM25) — revisit only if KB > 300K chars.
- Multi-turn chat, protocol history UI for practitioners, PDF server rendering.
