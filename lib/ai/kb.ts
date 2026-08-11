import fs from 'fs';
import path from 'path';

export interface KbDocument {
  id: string;
  title: string;
  content: string;
  isProduct: boolean;
}

export interface KnowledgeBase {
  documents: KbDocument[];
  productTitles: string[];
  combinedText: string;
  totalChars: number;
}

/** Above this, warn loudly — time to move to retrieval instead of full-context. */
export const KB_SIZE_WARN_CHARS = 300_000;

const cache = new Map<string, KnowledgeBase>();

export function clearKbCacheForTests(): void {
  cache.clear();
}

function readMarkdownFiles(dir: string, isProduct: boolean): KbDocument[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      const heading = content.match(/^#\s+(.+)$/m);
      return {
        id: file.replace(/\.md$/, ''),
        title: heading ? heading[1].trim() : file.replace(/\.md$/, ''),
        content,
        isProduct,
      };
    });
}

export function loadKnowledgeBase(
  dir: string = process.env.KB_DIR || path.join(process.cwd(), 'knowledge')
): KnowledgeBase {
  const cached = cache.get(dir);
  if (cached) return cached;

  const documents = [
    ...readMarkdownFiles(path.join(dir, 'products'), true),
    ...readMarkdownFiles(dir, false),
  ];
  const combinedText = documents
    .map((d) => `=== ${d.title} ===\n${d.content}`)
    .join('\n\n');
  const kb: KnowledgeBase = {
    documents,
    productTitles: documents.filter((d) => d.isProduct).map((d) => d.title),
    combinedText,
    totalChars: combinedText.length,
  };
  if (kb.totalChars > KB_SIZE_WARN_CHARS) {
    console.warn(
      `[kb] knowledge base is ${kb.totalChars} chars — consider moving to per-query retrieval`
    );
  }
  cache.set(dir, kb);
  return kb;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Loose two-way contains match so "Magnesium" matches "WN Magnesium (Food-Grown®)". */
export function isKnownProduct(name: string, kb: KnowledgeBase): boolean {
  const n = normalise(name);
  if (n.length < 4) return false;
  return kb.productTitles.some((title) => {
    const t = normalise(title);
    return t.includes(n) || n.includes(t);
  });
}

/**
 * Loose match against ANY knowledge-base document — products AND clinical
 * materials (dosing principles, contraindications, research). Used to verify
 * the assistant's citations point at real documents, not fabricated sources.
 * Also matches on the document id (filename) so "contraindications" resolves.
 */
export function isKnownDocument(name: string, kb: KnowledgeBase): boolean {
  const n = normalise(name);
  if (n.length < 4) return false;
  return kb.documents.some((doc) => {
    const t = normalise(doc.title);
    const id = normalise(doc.id);
    return t.includes(n) || n.includes(t) || id.includes(n) || n.includes(id);
  });
}
