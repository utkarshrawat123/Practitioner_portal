/**
 * Offline content pipeline. Reads raw source files from content-sources/, turns
 * each into draft microlearning lessons via Claude, and writes them to the
 * review queue as status:'draft'. NEVER publishes — a human approves in /admin.
 *
 *   npm run generate-lessons
 *
 * Requires ANTHROPIC_API_KEY. The core (runGeneration) is dependency-injected so
 * it can be tested without the API.
 */
import { loadSources as realLoadSources, type SourceDoc } from '@/lib/lessons/sources';
import {
  generateLessons as realGenerateLessons,
  isConfigured,
  type GenerateResult,
} from '@/lib/lessons/generate';
import { insertLesson as realInsertLesson } from '@/lib/db';

export interface GenerationDeps {
  loadSources: (dir: string) => Promise<SourceDoc[]>;
  generateLessons: (source: SourceDoc) => Promise<GenerateResult>;
  insertLesson: (l: {
    sourceFile: string;
    title: string;
    summary: string;
    takeaways: string[];
    quiz: { question: string; options: string[]; correctIndex: number; explanation: string };
    topics: string[];
    claimFlags: string[];
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  }) => number;
  log: (msg: string) => void;
}

export interface GenerationSummary {
  files: number;
  drafts: number;
  flags: number;
}

export async function runGeneration(dir: string, deps: GenerationDeps): Promise<GenerationSummary> {
  const sources = await deps.loadSources(dir);
  let drafts = 0;
  let flags = 0;
  for (const source of sources) {
    let result: GenerateResult;
    try {
      result = await deps.generateLessons(source);
    } catch (err) {
      deps.log(`  ✗ ${source.file}: ${(err as Error).message} — skipped`);
      continue;
    }
    for (const lesson of result.lessons) {
      deps.insertLesson({
        sourceFile: source.file,
        title: lesson.title,
        summary: lesson.summary,
        takeaways: lesson.takeaways,
        quiz: lesson.quiz,
        topics: lesson.topics,
        claimFlags: lesson.claim_flags,
        model: 'claude-opus-4-8',
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
      });
      drafts += 1;
      flags += lesson.claim_flags.length;
    }
    deps.log(`  ✓ ${source.file}: ${result.lessons.length} draft lesson(s)`);
  }
  return { files: sources.length, drafts, flags };
}

async function main(): Promise<void> {
  if (!isConfigured()) {
    console.error(
      'ANTHROPIC_API_KEY is not set. Add it to .env.local (or the environment) and re-run.'
    );
    process.exit(1);
  }
  console.log('Generating draft lessons from content-sources/ …');
  const summary = await runGeneration('content-sources', {
    loadSources: realLoadSources,
    generateLessons: (s) => realGenerateLessons(s),
    insertLesson: realInsertLesson,
    log: (m) => console.log(m),
  });
  console.log(
    `\nDone. ${summary.files} source file(s) → ${summary.drafts} draft lesson(s), ` +
      `${summary.flags} clinical-claim flag(s). Review and publish in /admin.`
  );
}

// Run only when executed directly (not when imported by tests).
if (process.argv[1] && process.argv[1].includes('generate-lessons')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
