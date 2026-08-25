import { outboundUserAgent } from '@/lib/support';

// Read per request, not frozen at module load, so a secret set at runtime applies.
const userAgent = (): string => outboundUserAgent('membership verification');
const MIN_INTERVAL_MS = 1000;
const TIMEOUT_MS = 8000;

let lastRequestAt = 0;

/** Rate-limited, identified, time-limited GET. Returns HTML or null on any failure. */
export async function politeFetch(url: string): Promise<string | null> {
  const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent(), Accept: 'text/html' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export function scoreNameMatch(html: string, fullName: string): 'high' | 'partial' | 'none' {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  const name = fullName.trim().replace(/\s+/g, ' ').toLowerCase();
  if (name && text.includes(name)) return 'high';
  const parts = name.split(' ');
  const surname = parts[parts.length - 1] ?? '';
  if (surname.length >= 4 && text.includes(surname)) return 'partial';
  return 'none';
}
