import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import { MOCK_CATALOG } from '@/lib/commerce';
import { loadKnowledgeBase, clearKbCacheForTests, isKnownProduct } from '@/lib/ai/kb';

beforeEach(() => clearKbCacheForTests());

// Every product a practitioner can sell through Patient Carts must have a
// knowledge-base dossier: SYSTEM_RULES forbids the assistant from discussing
// products without one, so a catalog/KB gap makes a sellable product
// silently undiscussable in Ask the Expert.
describe('catalog ↔ knowledge base alignment', () => {
  it('has a KB dossier for every mock-catalog product', () => {
    const kb = loadKnowledgeBase(path.join(process.cwd(), 'knowledge'));
    const missing = MOCK_CATALOG.filter((p) => !isKnownProduct(p.title, kb)).map((p) => p.title);
    expect(missing).toEqual([]);
  });
});
