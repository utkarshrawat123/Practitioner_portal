import { z } from 'zod';
import { AssistantError, geminiKeys, geminiModel } from '@/lib/ai/assistant';

/**
 * Content Factory: turn one webinar (title + transcript) into a set of linked
 * DRAFT assets — a lesson (summary + crib-sheet takeaways + quiz), a patient
 * handout, a clinical pearl and social clips. Nothing is published; the route
 * lands these in the existing admin review queues.
 */

const assetsSchema = z.object({
  summary: z.string(),
  takeaways: z.array(z.string()),
  topics: z.array(z.string()),
  quiz: z.object({
    question: z.string(),
    options: z.array(z.string()),
    correctIndex: z.number(),
    explanation: z.string(),
  }),
  patient_handout: z.string(),
  clinical_pearl: z.string(),
  social_clips: z.array(z.string()),
});

export type WebinarAssets = z.infer<typeof assetsSchema>;

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    takeaways: { type: 'ARRAY', items: { type: 'STRING' } },
    topics: { type: 'ARRAY', items: { type: 'STRING' } },
    quiz: {
      type: 'OBJECT',
      properties: {
        question: { type: 'STRING' },
        options: { type: 'ARRAY', items: { type: 'STRING' } },
        correctIndex: { type: 'INTEGER' },
        explanation: { type: 'STRING' },
      },
      required: ['question', 'options', 'correctIndex', 'explanation'],
    },
    patient_handout: { type: 'STRING' },
    clinical_pearl: { type: 'STRING' },
    social_clips: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['summary', 'takeaways', 'topics', 'quiz', 'patient_handout', 'clinical_pearl', 'social_clips'],
} as const;

const SYSTEM = `You are Wild Nutrition's practitioner content editor. From a single webinar
transcript, draft a linked set of educational assets for a QUALIFIED nutrition practitioner audience.
Rules:
- Ground everything in the transcript. Do not invent products, doses, studies or clinical claims that
  are not in the transcript.
- summary: 2–4 sentence overview of the webinar.
- takeaways: 3–6 concise crib-sheet bullet points.
- topics: 2–5 short topic tags.
- quiz: ONE multiple-choice question with exactly 4 options, a correctIndex (0-3), and a one-line explanation.
- patient_handout: warm, plain-language handout a practitioner could give a client — no jargon, no doses
  beyond what the transcript states, no clinical claims beyond the transcript.
- clinical_pearl: ONE short practical tip (one or two sentences).
- social_clips: 3–5 short social captions summarising key moments.
These are DRAFTS for human review — never final clinical advice.`;

export type FactoryComplete = (
  system: string,
  user: string
) => Promise<{ text: string; inputTokens: number; outputTokens: number; model: string }>;

/** Default provider: Google Gemini with the same key-fallback as Ask the Expert. */
const geminiComplete: FactoryComplete = async (system, user) => {
  const keys = geminiKeys();
  if (keys.length === 0) throw new AssistantError('api_error', 'No Gemini key configured');
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_SCHEMA,
      temperature: 0.3,
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

export async function generateWebinarAssets(
  title: string,
  transcript: string,
  complete: FactoryComplete = geminiComplete
): Promise<{ assets: WebinarAssets; model: string; inputTokens: number; outputTokens: number }> {
  const user = `Webinar title: ${title}\n\nTranscript:\n${transcript}`;
  const { text, inputTokens, outputTokens, model } = await complete(SYSTEM, user);
  if (!text) throw new AssistantError('malformed_output', 'Model returned no text');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AssistantError('malformed_output', 'Model output was not valid JSON');
  }
  const result = assetsSchema.safeParse(parsed);
  if (!result.success) throw new AssistantError('malformed_output', result.error.message);
  return { assets: result.data, model, inputTokens, outputTokens };
}
