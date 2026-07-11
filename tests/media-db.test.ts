import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-media-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

const fileItem = (over: Record<string, unknown> = {}) => ({
  title: 'Protocol Guide',
  type: 'document',
  description: 'A PDF guide',
  contentKind: 'file' as const,
  url: 'https://blob.example/media/guide.pdf',
  pathname: 'media/guide.pdf',
  thumbnailUrl: 'https://blob.example/thumbnails/guide.png',
  thumbnailPathname: 'thumbnails/guide.png',
  size: 12345,
  ...over,
});

describe('media db', () => {
  it('creates and reads back a media item', async () => {
    const db = await import('@/lib/db');
    const id = await db.createMedia(fileItem());
    const row = await db.getMedia(id);
    expect(row).not.toBeNull();
    expect(row!.title).toBe('Protocol Guide');
    expect(row!.contentKind).toBe('file');
    expect(row!.published).toBe(true);
    expect(row!.size).toBe(12345);
  });

  it('listPublishedMedia excludes hidden rows and filters by type', async () => {
    const db = await import('@/lib/db');
    const a = await db.createMedia(fileItem({ title: 'Doc A', type: 'document' }));
    await db.createMedia(fileItem({ title: 'Vid B', type: 'video', contentKind: 'link', url: 'https://youtu.be/x', pathname: null }));
    await db.setMediaPublished(a, false);
    const published = await db.listPublishedMedia();
    expect(published.map((m) => m.title)).toEqual(['Vid B']);
    const videos = await db.listPublishedMedia('video');
    expect(videos).toHaveLength(1);
    const docs = await db.listPublishedMedia('document');
    expect(docs).toHaveLength(0); // Doc A is hidden
  });

  it('deletes a media item', async () => {
    const db = await import('@/lib/db');
    const id = await db.createMedia(fileItem());
    await db.deleteMedia(id);
    expect(await db.getMedia(id)).toBeNull();
  });
});
