import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { loadKnowledgeBase, clearKbCacheForTests, KB_SIZE_WARN_CHARS } from '@/lib/ai/kb';
import bundle from '@/lib/ai/kb.bundle.json';

beforeEach(() => clearKbCacheForTests());

const BUNDLE_PATH = path.join(process.cwd(), 'lib', 'ai', 'kb.bundle.json');
const lf = (s: string) => s.replace(/\r\n/g, '\n');

// On Cloudflare Workers there is no filesystem, so the assistant reads its
// knowledge base from the committed bundle, NOT from knowledge/. A stale bundle
// therefore serves outdated clinical content in production while every other
// test (which reads from disk) stays green. This is that missing guard.
describe('kb.bundle.json stays in sync with knowledge/', () => {
  const onDisk = () => loadKnowledgeBase(path.join(process.cwd(), 'knowledge')).documents;

  it('bundles exactly the documents that exist on disk, in the same order', () => {
    expect(bundle.documents.map((d) => d.id)).toEqual(onDisk().map((d) => d.id));
  });

  it('bundles identical titles, product flags and content', () => {
    const disk = onDisk();
    bundle.documents.forEach((bundled, i) => {
      expect(bundled.title).toBe(disk[i].title);
      expect(bundled.isProduct).toBe(disk[i].isProduct);
      expect(lf(bundled.content)).toBe(lf(disk[i].content));
    });
  });

  it('stores LF newlines so the bundle is byte-identical across platforms', () => {
    // Windows checks knowledge/*.md out as CRLF (core.autocrlf), so a bundle
    // regenerated there embeds \r\n and diffs against the same content bundled
    // on macOS/Linux.
    expect(fs.readFileSync(BUNDLE_PATH, 'utf8')).not.toMatch(/\\r\\n/);
  });
});

describe('knowledge base size budget', () => {
  it('stays within the full-context prompt budget', () => {
    // The assistant stuffs kb.combinedText into every request (no retrieval),
    // so KB size is per-query token cost. Past this the loader warns and we
    // need per-query retrieval instead.
    const kb = loadKnowledgeBase(path.join(process.cwd(), 'knowledge'));
    expect(kb.totalChars).toBeLessThanOrEqual(KB_SIZE_WARN_CHARS);
  });
});
