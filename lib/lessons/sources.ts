import fs from 'fs';
import path from 'path';

export interface SourceDoc {
  file: string;
  text: string;
}

async function extractPdf(fullPath: string): Promise<string> {
  // Optional dependency — only needed if a PDF source is present. The non-literal
  // specifier keeps `pdf-parse` out of the type/build graph so it isn't a hard dep.
  const spec = 'pdf-parse';
  let mod: { default: (b: Buffer) => Promise<{ text: string }> };
  try {
    mod = (await import(/* @vite-ignore */ spec)) as typeof mod;
  } catch {
    throw new Error(
      `A PDF source was found but "pdf-parse" is not installed. Run "npm i pdf-parse" or convert the file to markdown/txt.`
    );
  }
  const result = await mod.default(fs.readFileSync(fullPath));
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
