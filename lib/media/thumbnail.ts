const TIMEOUT_MS = 8000;

export function parseYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Best-effort thumbnail URL for an external link. Never throws; returns null when unknown. */
export async function resolveLinkThumbnail(rawUrl: string): Promise<string | null> {
  try {
    const ytId = parseYouTubeId(rawUrl);
    if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

    if (/vimeo\.com\/\d+/.test(rawUrl)) {
      const res = await fetch(
        `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(rawUrl)}`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) }
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { thumbnail_url?: string };
      return json.thumbnail_url ?? null;
    }

    const res = await fetch(rawUrl, {
      headers: { 'User-Agent': 'WildNutritionPractitionerPortal/1.0 (+utkarshrawatofficial@gmail.com)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
