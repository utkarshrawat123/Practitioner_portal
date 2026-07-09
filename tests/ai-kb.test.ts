import { describe, it, expect, beforeEach } from 'vitest';
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

describe('real knowledge base', () => {
  it('loads at least 5 sample product dossiers, all marked SAMPLE', () => {
    const kb = loadKnowledgeBase(path.join(process.cwd(), 'knowledge'));
    expect(kb.productTitles.length).toBeGreaterThanOrEqual(5);
    for (const doc of kb.documents) {
      expect(doc.content).toContain('SAMPLE — replace with approved clinical content');
    }
  });
});
