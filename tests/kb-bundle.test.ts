import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadKnowledgeBase, clearKbCacheForTests } from '@/lib/ai/kb';

describe('knowledge base bundle fallback (Workers has no filesystem)', () => {
  beforeEach(() => clearKbCacheForTests());

  it('falls back to the bundled docs when the KB dir is unreadable/empty', () => {
    // Simulate the Workers runtime: an empty dir yields no files on disk, so
    // loadKnowledgeBase must use the build-time bundle instead of returning empty.
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-empty-'));
    const kb = loadKnowledgeBase(emptyDir);
    expect(kb.documents.length).toBeGreaterThan(0);
    expect(kb.productTitles.length).toBeGreaterThan(0);
    expect(kb.combinedText.length).toBeGreaterThan(0);
  });

  it('reads live from disk when the KB dir has markdown', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-live-'));
    fs.writeFileSync(path.join(dir, 'thing.md'), '# Live Thing\n\nbody');
    const kb = loadKnowledgeBase(dir);
    expect(kb.documents.some((d) => d.title === 'Live Thing')).toBe(true);
  });
});
