import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadKnowledgeBase, clearKbCacheForTests } from '@/lib/ai/kb';
import {
  validateKnowledgeBase,
  reviewStatus,
  docsAwaitingClinicalApproval,
} from '@/lib/ai/kbValidate';

beforeEach(() => clearKbCacheForTests());

/** Build a KB from markdown written to a throwaway dir. */
function kbFrom(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-kb-contract-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return loadKnowledgeBase(dir);
}

const GOOD_PRODUCT = `# Test Product

> **Clinical review:** AWAITING APPROVAL — not for live practitioner use.

## Key ingredients
Something at 10mg.

## Label dosing
1 capsule daily with food.

## Mechanism & evidence notes
Notes here.

## Cautions & interactions
- Not in pregnancy.
`;

describe('validateKnowledgeBase', () => {
  it('reports no issues for a well-formed product dossier', () => {
    const issues = validateKnowledgeBase(kbFrom({ 'products/test.md': GOOD_PRODUCT }));
    expect(issues).toEqual([]);
  });

  it('flags a product dossier with no "## Label dosing" section', () => {
    const broken = GOOD_PRODUCT.replace('## Label dosing\n1 capsule daily with food.\n', '');
    const issues = validateKnowledgeBase(kbFrom({ 'products/test.md': broken }));
    expect(issues).toHaveLength(1);
    expect(issues[0].docId).toBe('test');
    expect(issues[0].problem).toMatch(/Label dosing/);
  });

  // Each section backs a specific SYSTEM_RULES instruction: dosing is quoted
  // verbatim from "Label dosing", claims must come from "Mechanism & evidence
  // notes", and safety_flags lean on "Cautions & interactions".
  const REQUIRED_SECTIONS = [
    'Key ingredients',
    'Label dosing',
    'Mechanism & evidence notes',
    'Cautions & interactions',
  ];

  it.each(REQUIRED_SECTIONS)('flags a product dossier missing "## %s"', (section) => {
    const lines = GOOD_PRODUCT.split('\n');
    const start = lines.findIndex((l) => l === `## ${section}`);
    const after = lines.findIndex((l, i) => i > start && l.startsWith('## '));
    lines.splice(start, (after === -1 ? lines.length : after) - start);
    const issues = validateKnowledgeBase(kbFrom({ 'products/test.md': lines.join('\n') }));
    expect(issues.map((i) => i.problem).join(' ')).toContain(section);
  });

  it('flags a required section that is present but empty', () => {
    const empty = GOOD_PRODUCT.replace('1 capsule daily with food.', '');
    const issues = validateKnowledgeBase(kbFrom({ 'products/test.md': empty }));
    expect(issues.map((i) => i.problem).join(' ')).toMatch(/Label dosing.*empty|empty.*Label dosing/);
  });

  it('flags any document with no H1 title', () => {
    const noTitle = 'no heading here\n\n> **Clinical review:** AWAITING APPROVAL — x\n';
    const issues = validateKnowledgeBase(kbFrom({ 'guide.md': noTitle }));
    expect(issues.map((i) => i.problem).join(' ')).toMatch(/H1/);
  });

  it('flags a document with no clinical-review marker, so a stripped banner cannot pass silently', () => {
    const unmarked = GOOD_PRODUCT.replace(
      '> **Clinical review:** AWAITING APPROVAL — not for live practitioner use.\n',
      ''
    );
    const issues = validateKnowledgeBase(kbFrom({ 'products/test.md': unmarked }));
    expect(issues.map((i) => i.problem).join(' ')).toMatch(/Clinical review/);
  });

  it('does not require product sections of non-product clinical guides', () => {
    const guide = `# Dosing Principles

> **Clinical review:** AWAITING APPROVAL — not for live practitioner use.

- Never exceed the label dose.
`;
    expect(validateKnowledgeBase(kbFrom({ 'dosing.md': guide }))).toEqual([]);
  });
});

describe('reviewStatus', () => {
  it('reads both approval states from the marker', () => {
    const awaiting = kbFrom({ 'products/a.md': GOOD_PRODUCT }).documents[0];
    expect(reviewStatus(awaiting)).toBe('awaiting-approval');

    const approvedDoc = GOOD_PRODUCT.replace(
      'AWAITING APPROVAL — not for live practitioner use.',
      'APPROVED 2026-09-01 — Wild Nutrition clinical team.'
    );
    const approved = kbFrom({ 'products/b.md': approvedDoc }).documents[0];
    expect(reviewStatus(approved)).toBe('approved');
  });

  it('returns null when no marker is present', () => {
    const bare = kbFrom({ 'products/c.md': '# Bare\n\nno marker\n' }).documents[0];
    expect(reviewStatus(bare)).toBeNull();
  });
});

describe('the real knowledge base', () => {
  const realKb = () => loadKnowledgeBase(path.join(process.cwd(), 'knowledge'));

  it('satisfies the dossier contract the assistant prompt depends on', () => {
    expect(validateKnowledgeBase(realKb())).toEqual([]);
  });

  it('still ships at least 5 product dossiers plus the two clinical guides', () => {
    const kb = realKb();
    expect(kb.productTitles.length).toBeGreaterThanOrEqual(5);
    const ids = kb.documents.map((d) => d.id);
    expect(ids).toContain('contraindications');
    expect(ids).toContain('dosing-principles');
  });

  it('declares every document as awaiting clinical approval until real dossiers land', () => {
    // Go-live gate: this list must be empty before the assistant is used with
    // real practitioners. See docs/KB_AUTHORING.md.
    const kb = realKb();
    expect(docsAwaitingClinicalApproval(kb).length).toBe(kb.documents.length);
  });
});
