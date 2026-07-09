import fs from 'fs';
import path from 'path';

export interface SourceDoc {
  file: string;
  text: string;
}

async function extractPdf(fullPath: string): Promise<string> {
  // Dynamic import so the dependency is only needed when a PDF is present.
  const pdfParse = (await import('pdf-parse')).default as (b: Buffer) => Promise<{ text: string }>;
  const result = await pdfParse(fs.readFileSync(fullPath));
  return result.text;
}

/** Load markdown/text/PDF source files from a directory, skipping empty ones. */
export async function loadSources(dir: string): Promise<SourceDoc[]> {
  if (!fs.existsSync(dir)) return [];
  const docs: SourceDoc[] = [];
  for (const file of fs.readdirSync(dir).sort()) {
    const ext = path.extname(file).toLowerCase();
    const full = path.join(dir, file);
    let text = '';
    if (ext === '.md' || ext === '.txt') {
      text = fs.readFileSync(full, 'utf8');
    } else if (ext === '.pdf') {
      text = await extractPdf(full);
    } else {
      continue;
    }
    if (text.trim().length === 0) continue;
    docs.push({ file, text });
  }
  return docs;
}
