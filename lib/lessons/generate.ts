import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { normaliseTopic, isKnownTopic, TOPICS } from '@/lib/lessons/topics';
import { scanClaims } from '@/lib/lessons/claims';

export const MODEL = 'claude-opus-4-8';

export class LessonError extends Error {}

const quizSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).min(2),
  correctIndex: z.number().int().min(0),
  explanation: z.string(),
});

const rawLessonSchema = z.object({
  title: z.string(),
  summary: z.string(),
  takeaways: z.array(z.string()).min(3).max(5),
  quiz: quizSchema,
  topics: z.array(z.string()).min(1),
  claim_flags: z.array(z.string()),
});

const responseSchema = z.object({ lessons: z.array(rawLessonSchema).min(1).max(4) });

export type Quiz = z.infer<typeof quizSchema>;
export interface DraftLesson {
  title: string;
  summary: string;
  takeaways: string[];
  quiz: Quiz;
  topics: string[];
  claim_flags: string[];
}

const QUIZ_JSON = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
    correctIndex: { type: 'integer' },
    explanation: { type: 'string' },
  },
  required: ['question', 'options', 'correctIndex', 'explanation'],
  additionalProperties: false,
};

const OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    lessons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          takeaways: { type: 'array', items: { type: 'string' } },
          quiz: QUIZ_JSON,
          topics: { type: 'array', items: { type: 'string' } },
          claim_flags: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'summary', 'takeaways', 'quiz', 'topics', 'claim_flags'],
        additionalProperties: false,
      },
    },
  },
  required: ['lessons'],
  additionalProperties: false,
} as const;

const SYSTEM_RULES = `You are a curriculum developer for the Wild Nutrition practitioner
education hub. Turn the practitioner source material below into structured microlearning
lessons for qualified nutrition practitioners.

Rules:
1. Produce 1-4 short lessons, each grounded ONLY in the source material. Do not add facts,
   figures, or clinical claims that are not present in the source.
2. Each lesson: a clear title; a 200-400 word summary in plain professional language;
   3-5 key takeaways; one multiple-choice quiz question with 2-4 options, the zero-based
   correctIndex, and a one-sentence explanation.
3. Tag each lesson with 1-3 topics from EXACTLY this controlled list (use the slugs):
   ${TOPICS.map((t) => t.slug).join(', ')}. If nothing fits, use "general".
4. For every sentence that makes a clinical or efficacy claim, ensure it is traceable to
   the source. If you include any claim that is NOT clearly supported by the source, add a
   short description of it to that lesson's claim_flags array so a human reviewer can check
   it. Prefer flagging over omitting when unsure.`;

export interface Completion {
  output: unknown;
  usage: { inputTokens: number; outputTokens: number } | null;
}

export type CompleteFn = (systemRules: string, sourceText: string) => Promise<Completion>;

export function isConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const callClaude: CompleteFn = async (systemRules, sourceText) => {
  const client = new Anthropic();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: systemRules,
      output_config: { format: { type: 'json_schema', schema: OUTPUT_JSON_SCHEMA } },
      messages: [{ role: 'user', content: `Source material:\n\n${sourceText}` }],
    } as Anthropic.MessageCreateParamsNonStreaming);
  } catch (err) {
    throw new LessonError((err as Error).message);
  }
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new LessonError('Model returned no text block');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.text);
  } catch {
    throw new LessonError('Model output was not valid JSON');
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
  lessons: DraftLesson[];
  usage: Completion['usage'];
}

export async function generateLessons(
  source: { file: string; text: string },
  complete: CompleteFn = callClaude
): Promise<GenerateResult> {
  const completion = await complete(SYSTEM_RULES, source.text);
  const parsed = responseSchema.safeParse(completion.output);
  if (!parsed.success) throw new LessonError(parsed.error.message);

  const lessons: DraftLesson[] = parsed.data.lessons.map((raw) => {
    const claimFlags = [...raw.claim_flags];

    const topics: string[] = [];
    for (const t of raw.topics) {
      if (!isKnownTopic(t)) {
        claimFlags.push(`Unknown topic "${t}" mapped to "general" — please re-tag.`);
      }
      const slug = normaliseTopic(t);
      if (!topics.includes(slug)) topics.push(slug);
    }

    claimFlags.push(...scanClaims(`${raw.summary}\n${raw.takeaways.join('\n')}`, source.text));

    return {
      title: raw.title,
      summary: raw.summary,
      takeaways: raw.takeaways,
      quiz: raw.quiz,
      topics,
      claim_flags: claimFlags,
    };
  });

  return { lessons, usage: completion.usage };
}
