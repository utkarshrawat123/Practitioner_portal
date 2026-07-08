import { describe, it, expect } from 'vitest';
import { renderHandout } from '@/lib/ai/handout';
import type { AssistantOutput } from '@/lib/ai/assistant';

const output: AssistantOutput = {
  status: 'ok',
  out_of_scope_reason: '',
  safety_flags: [],
  protocol: [
    {
      product: 'Magnesium (Food-Grown®)',
      dose: '2 capsules daily',
      rationale: 'Sleep support',
      evidence_notes: 'EFSA claim',
      kb_source: 'Magnesium (Food-Grown®)',
    },
  ],
  general_notes: 'Review in 8 weeks.',
  handout: {
    intro: 'Your practitioner has put together this plan.',
    explanation: 'Take with food.',
    lifestyle_notes: 'Regular sleep times help.',
  },
};

describe('renderHandout', () => {
  it('includes practitioner name, code, link and disclaimer', () => {
    const html = renderHandout({
      practitionerName: 'Jane Smith',
      code: 'WN-SMITH-AB2C',
      link: 'http://localhost:3100/r/WN-SMITH-AB2C',
      output,
    });
    expect(html).toContain('Jane Smith');
    expect(html).toContain('WN-SMITH-AB2C');
    expect(html).toContain('http://localhost:3100/r/WN-SMITH-AB2C');
    expect(html.toLowerCase()).toContain('not medical advice');
    expect(html).toContain('Magnesium (Food-Grown®)');
    expect(html).toContain('2 capsules daily');
  });

  it('escapes HTML in dynamic content', () => {
    const nasty = {
      ...output,
      handout: { ...output.handout, intro: '<script>alert(1)</script>' },
    };
    const html = renderHandout({
      practitionerName: '<b>Bad</b>',
      code: 'WN-X-1111',
      link: 'http://localhost:3100/r/WN-X-1111',
      output: nasty,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>Bad</b>');
  });
});
