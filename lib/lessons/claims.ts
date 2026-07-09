const CLAIM_KEYWORDS = [
  'treat',
  'cure',
  'prevent',
  'reverse',
  'clinically proven',
  'guaranteed',
  'diagnos',
];

/**
 * Deterministic net over the model's own flagging: if generated text uses
 * clinical-claim language that does not appear in the source material, flag it
 * for the reviewer. Case-insensitive substring comparison.
 */
export function scanClaims(text: string, sourceText: string): string[] {
  const lowerText = text.toLowerCase();
  const lowerSource = sourceText.toLowerCase();
  const flags: string[] = [];
  for (const kw of CLAIM_KEYWORDS) {
    if (lowerText.includes(kw) && !lowerSource.includes(kw)) {
      flags.push(`Unsupported claim language "${kw}" not traceable to the source material.`);
    }
  }
  return flags;
}
