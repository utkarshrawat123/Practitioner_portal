import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolveLinkThumbnail, parseYouTubeId } from '@/lib/media/thumbnail';

afterEach(() => vi.unstubAllGlobals());

describe('parseYouTubeId', () => {
  it('parses watch, short and embed URLs', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=abc123XYZ_-')).toBe('abc123XYZ_-');
    expect(parseYouTubeId('https://youtu.be/abc123XYZ_-')).toBe('abc123XYZ_-');
    expect(parseYouTubeId('https://www.youtube.com/embed/abc123XYZ_-')).toBe('abc123XYZ_-');
    expect(parseYouTubeId('https://example.com/x')).toBeNull();
  });
});

describe('resolveLinkThumbnail', () => {
  it('returns the YouTube thumbnail without a network call', async () => {
    const url = await resolveLinkThumbnail('https://youtu.be/abc123XYZ_-');
    expect(url).toBe('https://img.youtube.com/vi/abc123XYZ_-/hqdefault.jpg');
  });

  it('returns the Vimeo oEmbed thumbnail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ thumbnail_url: 'https://i.vimeocdn.com/x.jpg' }), { status: 200 })
    ));
    const url = await resolveLinkThumbnail('https://vimeo.com/123456');
    expect(url).toBe('https://i.vimeocdn.com/x.jpg');
  });

  it('falls back to og:image for a generic link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('<html><head><meta property="og:image" content="https://site.example/og.png"></head></html>', { status: 200 })
    ));
    const url = await resolveLinkThumbnail('https://site.example/article');
    expect(url).toBe('https://site.example/og.png');
  });

  it('returns null (never throws) on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
    expect(await resolveLinkThumbnail('https://site.example/x')).toBeNull();
  });
});
