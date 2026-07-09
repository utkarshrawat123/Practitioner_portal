import { describe, it, expect } from 'vitest';
import path from 'path';
import { TOPICS, normaliseTopic, isKnownTopic } from '@/lib/lessons/topics';
import { scanClaims } from '@/lib/lessons/claims';
import { loadSources } from '@/lib/lessons/sources';

describe('topics', () => {
  it('has the controlled vocabulary including core slugs', () => {
    const slugs = TOPICS.map((t) => t.slug);
    expect(slugs).toContain('hormones');
    expect(slugs).toContain('gut-health');
    expect(slugs).toContain('iron-deficiency');
    expect(slugs).toContain('general');
    expect(TOPICS.length).toBeGreaterThanOrEqual(12);
  });

  it('normalises known topics and falls back to general', () => {
    expect(normaliseTopic('Hormones')).toBe('hormones');
    expect(normaliseTopic('gut health')).toBe('gut-health');
    expect(normaliseTopic('quantum biology')).toBe('general');
    expect(isKnownTopic('sleep')).toBe(true);
    expect(isKnownTopic('nope')).toBe(false);
  });
});

describe('scanClaims', () => {
  it('flags claim language absent from the source', () => {
    const flags = scanClaims('This cures anxiety and prevents disease.', 'Magnesium supports calm.');
    expect(flags.join(' ')).toContain('cure');
  });

  it('does not flag claim language that appears in the source', () => {
    expect(scanClaims('May help prevent deficiency.', 'Supplementation can prevent deficiency.')).toEqual([]);
  });

  it('returns no flags for claim-free text', () => {
    expect(scanClaims('Supports normal muscle function.', 'anything')).toEqual([]);
  });
});

describe('loadSources', () => {
  it('loads md and txt sources and skips empty files', async () => {
    const docs = await loadSources(path.join(__dirname, 'fixtures', 'sources'));
    const files = docs.map((d) => d.file).sort();
    expect(files).toEqual(['note.txt', 'talk.md']);
    expect(docs.find((d) => d.file === 'talk.md')?.text).toContain('Magnesium');
  });
});
