export interface SafetyFlag {
  type: 'PREGNANCY' | 'MEDICATION' | 'MINOR' | 'SERIOUS_CONDITION';
  detail: string;
}

interface Rule {
  type: SafetyFlag['type'];
  pattern: RegExp;
  detail: string;
}

/**
 * Deterministic pre-screen — runs before any model call. Intentionally
 * broad: a false positive costs a cautionary note; a false negative is the
 * model's and reviewer's problem to catch. Keep in sync with
 * knowledge/contraindications.md.
 */
const RULES: Rule[] = [
  {
    type: 'PREGNANCY',
    pattern: /pregnan|breast[\s-]?feed|lactat|trying to conceive|\bttc\b|trimester|postpartum|post-natal|postnatal/i,
    detail: 'Pregnancy / breastfeeding / conception mentioned — only pregnancy-approved products under practitioner supervision.',
  },
  {
    type: 'MEDICATION',
    pattern:
      /warfarin|doac|anticoagulant|blood thinner|aspirin|\bssri\b|sertraline|fluoxetine|citalopram|escitalopram|venlafaxine|levothyroxine|thyroxine|metformin|insulin|statin|atorvastatin|simvastatin|methotrexate|lithium|digoxin|immunosuppress|chemotherapy|\bchemo\b|antibiotic|on medication|taking medication|prescri(?:bed|ption)|\bmeds\b/i,
    detail: 'Medication mentioned — practitioner interaction check required before any supplement suggestion.',
  },
  {
    type: 'MINOR',
    pattern: /\b(?:1[0-7]|[1-9])\s*(?:yo|y\/o|yrs? old|years? old)\b|under\s*18|\bchild\b|children|teenager|\bteen\b|p(?:ae|e)diatric/i,
    detail: 'Client may be under 18 — adult dosing does not apply; practitioner judgement required.',
  },
  {
    type: 'SERIOUS_CONDITION',
    pattern:
      /cancer|chemotherapy|\bchemo\b|kidney disease|\bckd\b|renal (?:impairment|failure|disease)|dialysis|liver disease|hepatic|cirrhosis|epilep|heart failure|transplant/i,
    detail: 'Serious medical condition mentioned — refer to the client’s medical team; do not suggest without supervision.',
  },
];

export function screenForRisks(profile: string): SafetyFlag[] {
  const flags: SafetyFlag[] = [];
  for (const rule of RULES) {
    if (rule.pattern.test(profile)) {
      flags.push({ type: rule.type, detail: rule.detail });
    }
  }
  return flags;
}
