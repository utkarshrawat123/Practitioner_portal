import { describe, it, expect } from 'vitest';
import {
  generateLessons,
  LessonError,
  type CompleteFn,
  type DraftLesson,
} from '@/lib/lessons/generate';

const source = { file: 'talk.md', text: 'Magnesium supports normal muscle function and sleep.' };

const oneLesson = (overrides: Partial<DraftLesson> = {}) => ({
  lessons: [
    {
      title: 'Magnesium and Sleep',
      summary: 'Magnesium supports normal muscle and psychological function.',
      takeaways: ['Supports muscle function', 'Often considered for sleep', 'Food-state forms'],
      quiz: {
        question: 'What does magnesium support?',
        options: ['Muscle function', 'Hair growth'],
        correctIndex: 0,
        explanation: 'It contributes to normal muscle function.',
      },
      topics: ['sleep'],
      claim_flags: [],
      ...overrides,
    },
  ],
});

const fake =
  (output: unknown, usage = { inputTokens: 100, outputTokens: 40 }): CompleteFn =>
  async () => ({ output, usage });

describe('generateLessons', () => {
  it('validates and returns lessons with usage', async () => {
    const result = await generateLessons(source, fake(oneLesson()));
    expect(result.lessons).toHaveLength(1);
    expect(result.lessons[0].topics).toEqual(['sleep']);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 40 });
  });

  it('merges model claim flags with deterministic claim scan', async () => {
    const withClaim = oneLesson({
      summary: 'This cures anxiety in every client.',
      claim_flags: ['Model flag: broad efficacy claim.'],
    });
    const result = await generateLessons(source, fake(withClaim));
    expect(result.lessons[0].claim_flags).toContain('Model flag: broad efficacy claim.');
    expect(result.lessons[0].claim_flags.join(' ')).toContain('cure');
  });

  it('maps unknown topics to general and flags them', async () => {
    const result = await generateLessons(source, fake(oneLesson({ topics: ['Quantum Biology'] })));
    expect(result.lessons[0].topics).toEqual(['general']);
    expect(result.lessons[0].claim_flags.join(' ')).toContain('Quantum Biology');
  });

  it('throws LessonError on malformed model output', async () => {
    await expect(generateLessons(source, fake({ nope: true }))).rejects.toBeInstanceOf(LessonError);
  });
});
