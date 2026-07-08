import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { isKnownProduct, type KnowledgeBase } from '@/lib/ai/kb';
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
  kb_source: z.string(),
});

const outputSchema = z.object({
  status: z.enum(['ok', 'out_of_scope']),
  out_of_scope_reason: z.string(),
  safety_flags: z.array(
    z.object({ type: z.string(), detail: z.string(), recommendation: z.string() })
  ),
  protocol: z.array(protocolItemSchema),
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
          kb_source: { type: 'string' },
        },
        required: ['product', 'dose', 'rationale', 'evidence_notes', 'kb_source'],
        additionalProperties: false,
      },
    },
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
    'general_notes',
    'handout',
  ],
  additionalProperties: false,
} as const;

const SYSTEM_RULES = `You are the Wild Nutrition Practitioner Protocol Assistant. You suggest
supplement protocols to qualified nutrition practitioners (never directly to clients),
grounded EXCLUSIVELY in the knowledge base provided below.

Hard rules — no exceptions:
1. Recommend ONLY products that appear in the knowledge base. Never mention or invent
   any other product.
2. Quote dosing VERBATIM from the "Label dosing" section of the product's dossier.
   Never invent, scale, combine, or adjust doses.
3. Evidence and mechanism notes must come from the dossiers. Never add clinical claims
   from your own knowledge.
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
   jargon, no claims beyond the dossiers, and no product doses other than the label dose.

Set kb_source on every protocol item to the exact dossier title used.`;

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
  return !!process.env.ANTHROPIC_API_KEY;
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
  const grounded = parsed.data.protocol.filter((item) => {
    if (isKnownProduct(item.product, kb)) return true;
    groundingWarnings.push(
      `Removed ungrounded product "${item.product}" — not found in the knowledge base.`
    );
    return false;
  });

  return {
    output: { ...parsed.data, protocol: grounded },
    groundingWarnings,
    usage: completion.usage,
  };
}
