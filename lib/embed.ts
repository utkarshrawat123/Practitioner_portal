/**
 * Resolves a media URL into how it should be played inline in the course player.
 * - Uploaded video files (contentKind 'file') and direct video URLs → native <video>.
 * - YouTube / Vimeo / Loom share links → an embeddable iframe URL.
 * - Anything else → a plain link to open in a new tab (documents, slides, images).
 */
export type Embed =
  | { kind: 'iframe'; src: string }
  | { kind: 'video'; src: string }
  | { kind: 'link'; src: string };

export function videoEmbed(url: string, contentKind?: 'file' | 'link'): Embed {
  const u = (url ?? '').trim();
  if (!u) return { kind: 'link', src: '' };

  // Uploaded files are served straight from Blob storage.
  if (contentKind === 'file') return { kind: 'video', src: u };

  // YouTube — watch?v=, youtu.be/, /embed/, /shorts/
  let m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return { kind: 'iframe', src: `https://www.youtube.com/embed/${m[1]}` };

  // Vimeo — vimeo.com/123456789 or /video/123456789
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return { kind: 'iframe', src: `https://player.vimeo.com/video/${m[1]}` };

  // Loom — loom.com/share/<id> or /embed/<id>
  m = u.match(/loom\.com\/(?:share|embed)\/([\w-]+)/);
  if (m) return { kind: 'iframe', src: `https://www.loom.com/embed/${m[1]}` };

  // Direct video file link.
  if (/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(u)) return { kind: 'video', src: u };

  // Fallback: not embeddable inline — open externally.
  return { kind: 'link', src: u };
}
