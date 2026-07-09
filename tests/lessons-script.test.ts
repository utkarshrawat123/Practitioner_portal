import { describe, it, expect, vi } from 'vitest';
import { runGeneration, type GenerationDeps } from '@/scripts/generate-lessons';
import type { DraftLesson } from '@/lib/lessons/generate';

const lesson = (title: string): DraftLesson => ({
  title,
  summary: 's',
  takeaways: ['a', 'b', 'c'],
  quiz: { question: 'q', options: ['x', 'y'], correctIndex: 0, explanation: 'e' },
  topics: ['sleep'],
  claim_flags: title === 'B1' ? ['flag one'] : [],
});

describe('runGeneration', () => {
  it('generates and inserts drafts across sources and tallies flags', async () => {
    const inserted: string[] = [];
    const deps: GenerationDeps = {
      loadSources: async () => [
        { file: 'a.md', text: 'source a' },
        { file: 'b.md', text: 'source b' },
      ],
      generateLessons: async (src) => ({
        lessons:
          src.file === 'a.md' ? [lesson('A1')] : [lesson('B1'), lesson('B2')],
        usage: { inputTokens: 10, outputTokens: 5 },
      }),
      insertLesson: (l) => {
        inserted.push(l.title);
        return inserted.length;
      },
      log: () => {},
    };
    const result = await runGeneration('content-sources', deps);
    expect(result).toEqual({ files: 2, drafts: 3, flags: 1 });
    expect(inserted).toEqual(['A1', 'B1', 'B2']);
  });

  it('continues past a source whose generation throws', async () => {
    const inserted: string[] = [];
    const deps: GenerationDeps = {
      loadSources: async () => [
        { file: 'good.md', text: 'ok' },
        { file: 'bad.md', text: 'boom' },
      ],
      generateLessons: async (src) => {
        if (src.file === 'bad.md') throw new Error('model failed');
        return { lessons: [lesson('Good')], usage: null };
      },
      insertLesson: (l) => {
        inserted.push(l.title);
        return inserted.length;
      },
      log: vi.fn(),
    };
    const result = await runGeneration('content-sources', deps);
    expect(result.files).toBe(2);
    expect(result.drafts).toBe(1);
    expect(inserted).toEqual(['Good']);
  });
});
