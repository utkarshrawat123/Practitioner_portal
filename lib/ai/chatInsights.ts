import { z } from 'zod';
import { AssistantError, geminiKeys, geminiModel } from '@/lib/ai/assistant';

/**
 * Consolidate a batch of practitioner live-chat questions into a ranked FAQ plus
 * a short narrative. Same provider seam + key-fallback as Ask the Expert / the
 * Content Factory. Degrades gracefully: the caller treats a thrown AssistantError
 * (e.g. Gemini 429) as "AI temporarily unavailable" and still shows the DB stats.
 */

const faqSchema = z.object({
  faqs: z.array(z.object({
    question: z.string(),
    suggestedAnswer: z.string(),
    frequency: z.number(),
    examples: z.array(z.string()),
  })),
  narrative: z.string(),
});

export type FaqConsolidation = z.infer<typeof faqSchema>;

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    faqs: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          suggestedAnswer: { type: 'STRING' },
          frequency: { type: 'INTEGER' },
          examples: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['question', 'suggestedAnswer', 'frequency', 'examples'],
      },
    },
    narrative: { type: 'STRING' },
  },
  required: ['faqs', 'narrative'],
} as const;

const SYSTEM = `You are Wild Nutrition's practitioner-support analyst. You are given a batch of
real questions practitioners asked in live chat over a period. Cluster them into the most common
themes and produce a consolidated FAQ.
Rules:
- faqs: rank by how often the theme appears, most common first. For each: a clear representative
  question, a concise suggestedAnswer a support agent could reuse, a frequency (how many of the
  supplied messages fit this theme), and up to 3 short verbatim-ish examples.
- Do not invent clinical claims, products or doses that aren't implied by the questions. Answers are
  DRAFTS for a human to review, not final clinical advice.
- narrative: 2–4 sentences summarising what practitioners needed most this period and any trend.`;

export type InsightsComplete = (
  system: string,
  user: string
) => Promise<{ text: string; inputTokens: number; outputTokens: number; model: string }>;

/** Default provider: Google Gemini with the shared key-fallback. */
const geminiComplete: InsightsComplete = async (system, user) => {
  const keys = geminiKeys();
  if (keys.length === 0) throw new AssistantError('api_error', 'No Gemini key configured');
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 8000,
    },
  });
  let lastErr: AssistantError = new AssistantError('api_error', 'All Gemini keys failed');
  for (const key of keys) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent?key=${key}`;
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody });
    } catch (err) {
      lastErr = new AssistantError('api_error', (err as Error).message);
      continue;
    }
    if (res.status === 429 || res.status === 503) {
      lastErr = new AssistantError('api_error', `Gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      continue;
    }
    if (!res.ok) throw new AssistantError('api_error', `Gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    return {
      text,
      inputTokens: data?.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
      model: geminiModel(),
    };
  }
  throw lastErr;
};

export async function generateFaqConsolidation(
  messages: string[],
  complete: InsightsComplete = geminiComplete
): Promise<{ result: FaqConsolidation; model: string }> {
  if (messages.length === 0) {
    return { result: { faqs: [], narrative: 'No practitioner questions in this period.' }, model: 'none' };
  }
  const user = `Practitioner questions (${messages.length}):\n` +
    messages.map((m, i) => `${i + 1}. ${m}`).join('\n');
  const { text, model } = await complete(SYSTEM, user);
  if (!text) throw new AssistantError('malformed_output', 'Model returned no text');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new AssistantError('malformed_output', 'Model output was not valid JSON'); }
  const result = faqSchema.safeParse(parsed);
  if (!result.success) throw new AssistantError('malformed_output', result.error.message);
  return { result: result.data, model };
}
