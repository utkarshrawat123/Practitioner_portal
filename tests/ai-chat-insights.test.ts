import { describe, it, expect } from 'vitest';
import { generateFaqConsolidation, type InsightsComplete } from '@/lib/ai/chatInsights';
import { topKeywords } from '@/lib/chat/keywords';

const consolidation = {
  faqs: [
    { question: 'How much magnesium for sleep?', suggestedAnswer: '200-400mg before bed.', frequency: 3, examples: ['magnesium dose for sleep?'] },
    { question: 'Is the iron supplement vegan?', suggestedAnswer: 'Yes, all forms are vegan.', frequency: 1, examples: ['is iron vegan'] },
  ],
  narrative: 'Practitioners mostly asked about magnesium dosing this period.',
};

const fake = (out: unknown): InsightsComplete => async () => ({
  text: JSON.stringify(out), inputTokens: 100, outputTokens: 50, model: 'test-model',
});
const throwing = (msg: string): InsightsComplete => async () => { throw new Error(msg); };

describe('generateFaqConsolidation', () => {
  it('parses ranked FAQs + narrative from the model output', async () => {
    const { result, model } = await generateFaqConsolidation(['q1', 'q2', 'q3'], fake(consolidation));
    expect(result.faqs).toHaveLength(2);
    expect(result.faqs[0].frequency).toBe(3);
    expect(result.narrative).toContain('magnesium');
    expect(model).toBe('test-model');
  });

  it('short-circuits with an empty batch (no provider call)', async () => {
    const { result } = await generateFaqConsolidation([], throwing('should not be called'));
    expect(result.faqs).toEqual([]);
  });

  it('propagates provider errors (429/no-key) for the route to catch', async () => {
    await expect(generateFaqConsolidation(['q'], throwing('Gemini 429'))).rejects.toThrow('429');
  });

  it('throws on malformed model output', async () => {
    await expect(generateFaqConsolidation(['q'], fake({ nope: true }))).rejects.toThrow();
  });
});

describe('topKeywords', () => {
  it('ranks meaningful terms, ignores stopwords, counts once per message', async () => {
    const kw = topKeywords([
      'How much magnesium should I take for sleep?',
      'magnesium magnesium magnesium dosing question',
      'Is the iron vegan?',
    ]);
    const terms = kw.map((k) => k.term);
    expect(terms).toContain('magnesium');
    expect(terms).not.toContain('the');
    expect(terms).not.toContain('how');
    // 'magnesium' appears in 2 messages → count 2 (once per message, not 4).
    expect(kw.find((k) => k.term === 'magnesium')?.count).toBe(2);
  });
});
