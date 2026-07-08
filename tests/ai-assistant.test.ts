import { describe, it, expect } from 'vitest';
import path from 'path';
import { loadKnowledgeBase, clearKbCacheForTests } from '@/lib/ai/kb';
import {
  generateProtocol,
  AssistantError,
  type AssistantOutput,
  type CompleteFn,
} from '@/lib/ai/assistant';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'kb');

function kb() {
  clearKbCacheForTests();
  return loadKnowledgeBase(FIXTURE_DIR);
}

const goodOutput: AssistantOutput = {
  status: 'ok',
  out_of_scope_reason: '',
  safety_flags: [],
  protocol: [
    {
      product: 'WN Magnesium (Food-Grown®)',
      dose: '2 capsules daily with food',
      rationale: 'Sleep and stress support.',
      evidence_notes: 'Contributes to normal psychological function.',
      kb_source: 'WN Magnesium (Food-Grown®)',
    },
  ],
  general_notes: 'Review at 8-12 weeks.',
  handout: { intro: 'Hello', explanation: 'Plan details', lifestyle_notes: 'Sleep hygiene' },
};

const fake =
  (output: unknown, usage = { inputTokens: 100, outputTokens: 50 }): CompleteFn =>
  async () => ({ output, usage });

describe('generateProtocol', () => {
  it('returns validated output with usage on the happy path', async () => {
    const result = await generateProtocol('35F, insomnia', kb(), [], fake(goodOutput));
    expect(result.output.status).toBe('ok');
    expect(result.output.protocol).toHaveLength(1);
    expect(result.groundingWarnings).toEqual([]);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it('strips products not in the knowledge base and records warnings', async () => {
    const withInvented = {
      ...goodOutput,
      protocol: [
        ...goodOutput.protocol,
        {
          product: 'Super Sleep Elixir 9000',
          dose: '1 daily',
          rationale: 'invented',
          evidence_notes: 'none',
          kb_source: 'none',
        },
      ],
    };
    const result = await generateProtocol('35F, insomnia', kb(), [], fake(withInvented));
    expect(result.output.protocol).toHaveLength(1);
    expect(result.output.protocol[0].product).toContain('Magnesium');
    expect(result.groundingWarnings).toHaveLength(1);
    expect(result.groundingWarnings[0]).toContain('Super Sleep Elixir 9000');
  });

  it('passes out_of_scope responses through untouched', async () => {
    const oos: AssistantOutput = {
      ...goodOutput,
      status: 'out_of_scope',
      out_of_scope_reason: 'Acute chest pain requires urgent medical care, not supplements.',
      protocol: [],
    };
    const result = await generateProtocol('chest pain now', kb(), [], fake(oos));
    expect(result.output.status).toBe('out_of_scope');
    expect(result.output.protocol).toEqual([]);
  });

  it('throws AssistantError on schema-invalid model output', async () => {
    await expect(
      generateProtocol('35F', kb(), [], fake({ nonsense: true }))
    ).rejects.toBeInstanceOf(AssistantError);
  });
});
