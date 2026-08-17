// Bundles knowledge/*.md into lib/ai/kb.bundle.json so the AI assistant can
// load its knowledge base on the Cloudflare Workers runtime, which has no
// filesystem. Re-run this whenever the knowledge/ content changes:
//   node scripts/bundle-kb.mjs
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const kbDir = path.join(root, 'knowledge');

function readMarkdownFiles(dir, isProduct) {
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

const documents = [
  ...readMarkdownFiles(path.join(kbDir, 'products'), true),
  ...readMarkdownFiles(kbDir, false),
];

const out = path.join(root, 'lib', 'ai', 'kb.bundle.json');
fs.writeFileSync(out, JSON.stringify({ documents }, null, 2) + '\n');
console.log(`Wrote ${documents.length} KB documents to ${path.relative(root, out)}`);
