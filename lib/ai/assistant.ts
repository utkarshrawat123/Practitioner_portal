import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { isKnownDocument, isKnownProduct, type KnowledgeBase } from '@/lib/ai/kb';
import type { SafetyFlag } from '@/lib/ai/safety';

export const MODEL = 'claude-opus-4-8';

export class AssistantError extends Error {
  constructor(public code: 'malformed_output' | 'api_error', message: string) {
    super(message);
  }
}

const protocolItemSchema = z.object({
  product: z.string(),
  dose: z.string(),
  rationale: z.string(),
  evidence_notes: z.string(),
  // ALL knowledge-base documents that support this item (product dossier plus any
  // clinical materials consulted) — never just one when several are relevant.
  sources: z.array(z.string()),
});

const outputSchema = z.object({
  status: z.enum(['ok', 'out_of_scope']),
  out_of_scope_reason: z.string(),
  safety_flags: z.array(
    z.object({ type: z.string(), detail: z.string(), recommendation: z.string() })
  ),
  protocol: z.array(protocolItemSchema),
  // Every KB document analysed for this query — evidence the whole corpus was searched.
  sources_reviewed: z.array(z.string()),
  general_notes: z.string(),
  handout: z.object({
    intro: z.string(),
    explanation: z.string(),
    lifestyle_notes: z.string(),
  }),
});

export type AssistantOutput = z.infer<typeof outputSchema>;
export type ProtocolItem = z.infer<typeof protocolItemSchema>;

/** JSON schema enforced by the API via output_config.format. */
const OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'out_of_scope'] },
    out_of_scope_reason: { type: 'string' },
    safety_flags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          detail: { type: 'string' },
          recommendation: { type: 'string' },
        },
        required: ['type', 'detail', 'recommendation'],
        additionalProperties: false,
      },
    },
    protocol: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          product: { type: 'string' },
          dose: { type: 'string' },
          rationale: { type: 'string' },
          evidence_notes: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
        },
        required: ['product', 'dose', 'rationale', 'evidence_notes', 'sources'],
        additionalProperties: false,
      },
    },
    sources_reviewed: { type: 'array', items: { type: 'string' } },
    general_notes: { type: 'string' },
    handout: {
      type: 'object',
      properties: {
        intro: { type: 'string' },
        explanation: { type: 'string' },
        lifestyle_notes: { type: 'string' },
      },
      required: ['intro', 'explanation', 'lifestyle_notes'],
      additionalProperties: false,
    },
  },
  required: [
    'status',
    'out_of_scope_reason',
    'safety_flags',
    'protocol',
    'sources_reviewed',
    'general_notes',
    'handout',
  ],
  additionalProperties: false,
} as const;

const SYSTEM_RULES = `You are the Wild Nutrition Practitioner Protocol Assistant. You suggest
supplement protocols to qualified nutrition practitioners (never directly to clients),
grounded EXCLUSIVELY in the knowledge base provided below.

EVIDENCE METHOD — follow this for EVERY query before you recommend anything:
1. Analyse ALL relevant resources in the knowledge base — every product dossier AND every
   clinical material (dosing principles, contraindication & referral guidance, and any
   research or background notes). Search the whole knowledge base for material relevant to
   this client; never answer from a single document or from your own memory.
2. Cross-reference before recommending: a product suggestion must be supported by its own
   dossier AND checked against the dosing principles and the contraindication/referral
   guidance. Corroborate across documents rather than relying on one.
3. Base every statement ONLY on the knowledge base. If the knowledge base does not contain
   enough to support a recommendation, say so plainly (in evidence_notes / general_notes)
   and do NOT fill the gap with outside knowledge or assumptions.
4. Explain your reasoning in "rationale", making clear which evidence you relied on.
5. Cite EVERY supporting document in "sources" using its exact document title — the product
   dossier PLUS any clinical materials consulted. When more than one document supports an
   item, list them all; never cite just one when others are relevant. Do not invent citations.
6. In "sources_reviewed", list every knowledge-base document you analysed for this query.

Hard rules — no exceptions:
1. Recommend ONLY products that appear in the knowledge base. Never mention or invent
   any other product.
2. Quote dosing VERBATIM from the "Label dosing" section of the product's dossier.
   Never invent, scale, combine, or adjust doses.
3. Evidence and mechanism notes must come from the dossiers and clinical materials. Never
   add clinical claims from your own knowledge.
4. If the pre-screen flags or the profile suggest pregnancy/breastfeeding, medication
   interactions, a client under 18, or a serious medical condition, populate safety_flags
   with a clear recommendation that defaults to: "Use your own clinical judgement and
   contact the Wild Nutrition technical support team before proceeding." Follow the
   Contraindication & Referral Guide in the knowledge base.
5. If the request is outside scope (diagnosis, acute or emergency symptoms, prescription
   advice, non-supplement questions), set status to "out_of_scope" with a short reason
   and an empty protocol.
6. Prefer 1-4 well-rationalised products. Point out nutrient overlaps between suggested
   products.
7. The handout section is written in warm plain language for the client, with no clinical
   jargon, no claims beyond the dossiers, and no product doses other than the label dose.`;

export interface Completion {
  output: unknown;
  usage: { inputTokens: number; outputTokens: number } | null;
}

export type CompleteFn = (
  systemRules: string,
  kbText: string,
  userText: string
) => Promise<Completion>;

export function isConfigured(): boolean {
  return geminiConfigured() || !!process.env.ANTHROPIC_API_KEY;
}

const callClaude: CompleteFn = async (systemRules, kbText, userText) => {
  const client = new Anthropic();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: [
        { type: 'text', text: systemRules },
        // KB is the stable prefix — cache it so repeat queries pay ~10% input cost.
        { type: 'text', text: kbText, cache_control: { type: 'ephemeral' } },
      ],
      output_config: {
        format: { type: 'json_schema', schema: OUTPUT_JSON_SCHEMA },
      },
      messages: [{ role: 'user', content: userText }],
    } as Anthropic.MessageCreateParamsNonStreaming);
  } catch (err) {
    throw new AssistantError('api_error', (err as Error).message);
  }
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') {
    throw new AssistantError('malformed_output', 'Model returned no text block');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.text);
  } catch {
    throw new AssistantError('malformed_output', 'Model output was not valid JSON');
  }
  return {
    output: parsed,
    usage: {
      inputTokens:
        response.usage.input_tokens +
        (response.usage.cache_read_input_tokens ?? 0) +
        (response.usage.cache_creation_input_tokens ?? 0),
      outputTokens: response.usage.output_tokens,
    },
  };
};

// ---- Google Gemini provider (Ask Lorna) ----

export const GEMINI_MODEL_DEFAULT = 'gemini-2.0-flash';

/** Same shape as OUTPUT_JSON_SCHEMA, in Gemini's uppercase-type schema dialect. */
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    status: { type: 'STRING', enum: ['ok', 'out_of_scope'] },
    out_of_scope_reason: { type: 'STRING' },
    safety_flags: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING' },
          detail: { type: 'STRING' },
          recommendation: { type: 'STRING' },
        },
        required: ['type', 'detail', 'recommendation'],
      },
    },
    protocol: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          product: { type: 'STRING' },
          dose: { type: 'STRING' },
          rationale: { type: 'STRING' },
          evidence_notes: { type: 'STRING' },
          sources: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['product', 'dose', 'rationale', 'evidence_notes', 'sources'],
      },
    },
    sources_reviewed: { type: 'ARRAY', items: { type: 'STRING' } },
    general_notes: { type: 'STRING' },
    handout: {
      type: 'OBJECT',
      properties: {
        intro: { type: 'STRING' },
        explanation: { type: 'STRING' },
        lifestyle_notes: { type: 'STRING' },
      },
      required: ['intro', 'explanation', 'lifestyle_notes'],
    },
  },
  required: ['status', 'out_of_scope_reason', 'safety_flags', 'protocol', 'sources_reviewed', 'general_notes', 'handout'],
} as const;

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || GEMINI_MODEL_DEFAULT;
}

/** All configured Gemini keys, in fallback order (primary first). */
export function geminiKeys(): string[] {
  return [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY2].filter(
    (k): k is string => !!k && k.length > 0
  );
}

const callGemini: CompleteFn = async (systemRules, kbText, userText) => {
  const keys = geminiKeys();
  if (keys.length === 0) throw new AssistantError('api_error', 'GEMINI_API_KEY is not set');
  const requestBody = JSON.stringify({
    systemInstruction: {
      parts: [{ text: `${systemRules}\n\n=== KNOWLEDGE BASE (your only source) ===\n${kbText}` }],
    },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 8000,
    },
  });

  let lastErr: AssistantError = new AssistantError('api_error', 'All Gemini keys failed');
  // Try each key in turn; a 429 (quota/rate-limit) or transient network error on
  // one key falls back to the next. Any other API error fails fast.
  for (const key of keys) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent?key=${key}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });
    } catch (err) {
      lastErr = new AssistantError('api_error', (err as Error).message);
      continue;
    }
    if (res.status === 429 || res.status === 503) {
      lastErr = new AssistantError('api_error', `Gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      continue; // exhausted / overloaded — fall back to the next key
    }
    if (!res.ok) {
      throw new AssistantError('api_error', `Gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
    }
    const data = await res.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    if (!text) throw new AssistantError('malformed_output', 'Gemini returned no text');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AssistantError('malformed_output', 'Gemini output was not valid JSON');
    }
    return {
      output: parsed,
      usage: {
        inputTokens: data?.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
  throw lastErr; // every key was rate-limited / failed
};

/** Ask the expert prefers Gemini when a key is set, else falls back to the Anthropic build. */
export function geminiConfigured(): boolean {
  return geminiKeys().length > 0;
}

export function selectProvider(): { complete: CompleteFn; model: string } {
  if (geminiConfigured()) return { complete: callGemini, model: geminiModel() };
  return { complete: callClaude, model: MODEL };
}

export interface GenerateResult {
  output: AssistantOutput;
  groundingWarnings: string[];
  usage: Completion['usage'];
}

export async function generateProtocol(
  profile: string,
  kb: KnowledgeBase,
  flags: SafetyFlag[],
  complete: CompleteFn = callClaude
): Promise<GenerateResult> {
  const flagText =
    flags.length > 0
      ? `\n\nDeterministic pre-screen flags (must be reflected in safety_flags):\n${flags
          .map((f) => `- ${f.type}: ${f.detail}`)
          .join('\n')}`
      : '';
  const userText = `Client profile from the practitioner:\n${profile}${flagText}`;

  const completion = await complete(SYSTEM_RULES, kb.combinedText, userText);

  const parsed = outputSchema.safeParse(completion.output);
  if (!parsed.success) {
    throw new AssistantError('malformed_output', parsed.error.message);
  }

  // Grounding net: strip anything not in the KB — the model cannot smuggle
  // an invented product past this.
  const groundingWarnings: string[] = [];
  const grounded = parsed.data.protocol
    .filter((item) => {
      if (isKnownProduct(item.product, kb)) return true;
      groundingWarnings.push(
        `Removed ungrounded product "${item.product}" — not found in the knowledge base.`
      );
      return false;
    })
    // Citation net: keep only citations that match a real KB document, so the
    // model cannot fabricate a supporting source. De-duplicate while we're here.
    .map((item) => {
      const kept: string[] = [];
      for (const src of item.sources) {
        if (isKnownDocument(src, kb)) {
          if (!kept.some((k) => k.toLowerCase() === src.toLowerCase())) kept.push(src);
        } else {
          groundingWarnings.push(
            `Dropped citation "${src}" on "${item.product}" — not a knowledge-base document.`
          );
        }
      }
      return { ...item, sources: kept };
    });

  // Same net for the corpus-wide "reviewed" list.
  const reviewed = parsed.data.sources_reviewed.filter((src) => isKnownDocument(src, kb));

  return {
    output: { ...parsed.data, protocol: grounded, sources_reviewed: reviewed },
    groundingWarnings,
    usage: completion.usage,
  };
}
