import { describe, it, expect } from 'vitest';
import { screenForRisks } from '@/lib/ai/safety';

const types = (profile: string) => screenForRisks(profile).map((f) => f.type);

describe('screenForRisks', () => {
  it('passes the canonical clean profile with no flags', () => {
    expect(screenForRisks('35F, perimenopausal, low ferritin, insomnia, vegetarian')).toEqual([]);
  });

  it('flags pregnancy, breastfeeding and TTC', () => {
    expect(types('34F, 12 weeks pregnant, tired')).toContain('PREGNANCY');
    expect(types('breastfeeding mother, low energy')).toContain('PREGNANCY');
    expect(types('trying to conceive, stressed')).toContain('PREGNANCY');
  });

  it('flags named medications and generic medication mentions', () => {
    expect(types('62M on warfarin, joint pain')).toContain('MEDICATION');
    expect(types('taking sertraline for anxiety')).toContain('MEDICATION');
    expect(types('on levothyroxine for hypothyroid')).toContain('MEDICATION');
    expect(types('currently on medication for blood pressure')).toContain('MEDICATION');
  });

  it('flags minors', () => {
    expect(types('16 years old, acne and fatigue')).toContain('MINOR');
    expect(types('teenager with low mood')).toContain('MINOR');
  });

  it('flags serious conditions', () => {
    expect(types('55F undergoing chemotherapy')).toContain('SERIOUS_CONDITION');
    expect(types('CKD stage 3, tired all the time')).toContain('SERIOUS_CONDITION');
    expect(types('history of liver disease')).toContain('SERIOUS_CONDITION');
  });

  it('accumulates multiple flags', () => {
    const t = types('pregnant, on levothyroxine');
    expect(t).toContain('PREGNANCY');
    expect(t).toContain('MEDICATION');
  });
});
