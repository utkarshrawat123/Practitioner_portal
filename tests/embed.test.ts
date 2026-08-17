import { describe, it, expect } from 'vitest';
import { videoEmbed } from '@/lib/embed';

describe('videoEmbed', () => {
  it('uploaded files play as native video regardless of extension', () => {
    expect(videoEmbed('https://pub-example.r2.dev/x/session.bin', 'file')).toEqual({
      kind: 'video',
      src: 'https://pub-example.r2.dev/x/session.bin',
    });
  });

  it('converts YouTube watch + short links to an embed iframe', () => {
    expect(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      kind: 'iframe',
      src: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    });
    expect(videoEmbed('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      kind: 'iframe',
      src: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    });
  });

  it('converts Vimeo and Loom share links to embeds', () => {
    expect(videoEmbed('https://vimeo.com/76979871').src).toBe('https://player.vimeo.com/video/76979871');
    expect(videoEmbed('https://www.loom.com/share/abc123DEF').src).toBe('https://www.loom.com/embed/abc123DEF');
  });

  it('treats a direct .mp4 link as native video', () => {
    expect(videoEmbed('https://cdn.example.com/clip.mp4')).toEqual({
      kind: 'video',
      src: 'https://cdn.example.com/clip.mp4',
    });
  });

  it('falls back to a link for non-video content', () => {
    expect(videoEmbed('https://example.com/handout.pdf', 'link')).toEqual({
      kind: 'link',
      src: 'https://example.com/handout.pdf',
    });
  });
});
