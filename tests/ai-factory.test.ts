import { describe, it, expect } from 'vitest';
import { generateWebinarAssets, type FactoryComplete } from '@/lib/ai/factory';

const assets = {
  summary: 'A webinar on perimenopausal sleep.',
  takeaways: ['Sleep hygiene matters', 'Magnesium may help'],
  topics: ['sleep', 'perimenopause'],
  quiz: { question: 'Which mineral was discussed?', options: ['Iron', 'Magnesium', 'Zinc', 'Copper'], correctIndex: 1, explanation: 'Magnesium was the focus.' },
  patient_handout: 'Here are some gentle steps to support your sleep...',
  clinical_pearl: 'Suggest magnesium in the evening for sleep support.',
  social_clips: ['3 sleep tips from our latest webinar', 'Why magnesium timing matters'],
};

const fake = (out: unknown): FactoryComplete => async () => ({
  text: JSON.stringify(out), inputTokens: 100, outputTokens: 50, model: 'test-model',
});

describe('generateWebinarAssets', () => {
  it('parses a full set of draft assets from the model output', async () => {
    const res = await generateWebinarAssets('Sleep webinar', 'transcript text here...', fake(assets));
    expect(res.assets.summary).toContain('perimenopausal sleep');
    expect(res.assets.takeaways).toHaveLength(2);
    expect(res.assets.quiz.correctIndex).toBe(1);
    expect(res.assets.social_clips.length).toBeGreaterThan(0);
    expect(res.model).toBe('test-model');
  });

  it('throws on malformed model output', async () => {
    await expect(generateWebinarAssets('x', 'transcript', fake({ nope: true }))).rejects.toThrow();
  });
});
