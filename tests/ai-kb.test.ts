import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadKnowledgeBase, clearKbCacheForTests, isKnownProduct } from '@/lib/ai/kb';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'kb');

beforeEach(() => clearKbCacheForTests());

describe('loadKnowledgeBase', () => {
  it('loads documents with titles and flags products', () => {
    const kb = loadKnowledgeBase(FIXTURE_DIR);
    expect(kb.documents).toHaveLength(3);
    expect(kb.productTitles.sort()).toEqual(['WN Iron Plus', 'WN Magnesium (Food-Grown®)']);
    const notes = kb.documents.find((d) => d.title === 'General Dosing Notes');
    expect(notes?.isProduct).toBe(false);
  });

  it('builds combined text with document headers', () => {
    const kb = loadKnowledgeBase(FIXTURE_DIR);
    expect(kb.combinedText).toContain('=== WN Magnesium (Food-Grown®) ===');
    expect(kb.combinedText).toContain('2 capsules daily with food');
    expect(kb.totalChars).toBe(kb.combinedText.length);
  });

  it('caches per directory until cleared', () => {
    const first = loadKnowledgeBase(FIXTURE_DIR);
    expect(loadKnowledgeBase(FIXTURE_DIR)).toBe(first);
    clearKbCacheForTests();
    expect(loadKnowledgeBase(FIXTURE_DIR)).not.toBe(first);
  });

  it('normalises CRLF to LF so the prompt is identical on every platform', () => {
    // Windows checks knowledge/*.md out as CRLF (core.autocrlf), which would
    // otherwise leak \r into combinedText and into the bundle.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-crlf-'));
    fs.writeFileSync(path.join(dir, 'crlf.md'), '# CRLF Doc\r\n\r\nline one\r\nline two\r\n');
    const kb = loadKnowledgeBase(dir);
    expect(kb.documents[0].content).not.toContain('\r');
    expect(kb.combinedText).not.toContain('\r');
    expect(kb.documents[0].title).toBe('CRLF Doc');
  });
});

describe('isKnownProduct', () => {
  it('matches product names loosely in both directions', () => {
    const kb = loadKnowledgeBase(FIXTURE_DIR);
    expect(isKnownProduct('Magnesium', kb)).toBe(true);          // model shorthand
    expect(isKnownProduct('WN Magnesium (Food-Grown®)', kb)).toBe(true);
    expect(isKnownProduct('wn iron plus', kb)).toBe(true);
    expect(isKnownProduct('Vitamin D', kb)).toBe(false);
    expect(isKnownProduct('Zn', kb)).toBe(false);                // too short to match
  });
});

// The real knowledge base is covered by tests/kb-contract.test.ts, which checks
// the dossier contract and clinical-review status rather than a literal SAMPLE
// banner (that assertion would have to be deleted the moment real content lands,
// leaving nothing enforcing the unapproved-content gate).
