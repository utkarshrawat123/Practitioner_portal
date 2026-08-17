/**
 * Error monitoring seam — Sentry over raw fetch, matching the house pattern
 * (Gemini/Resend/Shopify are all keyless-mock fetch seams, no SDKs).
 *
 * No-ops without SENTRY_DSN; lights up when the secret is set. Sends a minimal
 * Sentry envelope (store API v7) — enough for grouped exceptions with context.
 * If the team later prefers @sentry/cloudflare, this file is the swap point.
 */

interface Dsn {
  endpoint: string;
  key: string;
}

function parseDsn(raw: string | undefined): Dsn | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const projectId = u.pathname.replace(/^\//, '');
    if (!u.username || !projectId) return null;
    return { endpoint: `${u.protocol}//${u.host}/api/${projectId}/envelope/`, key: u.username };
  } catch {
    return null;
  }
}

/**
 * Report an exception. Never throws and never blocks the caller's outcome —
 * monitoring failures are logged and swallowed.
 */
export async function captureException(
  err: unknown,
  context: Record<string, string> = {}
): Promise<void> {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return; // unkeyed → silent no-op (console.error stays the baseline)

  const error = err instanceof Error ? err : new Error(String(err));
  const timestamp = new Date().toISOString();
  const event = {
    timestamp,
    level: 'error',
    platform: 'javascript',
    environment: process.env.PORTAL_URL?.includes('localhost') ? 'development' : 'production',
    exception: {
      values: [
        {
          type: error.name,
          value: error.message,
          stacktrace: error.stack ? { frames: [{ function: error.stack.split('\n')[1]?.trim() ?? '?' }] } : undefined,
        },
      ],
    },
    tags: context,
  };
  const envelope =
    JSON.stringify({ sent_at: timestamp }) +
    '\n' +
    JSON.stringify({ type: 'event' }) +
    '\n' +
    JSON.stringify(event) +
    '\n';

  try {
    await fetch(dsn.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=wn-portal/1.0, sentry_key=${dsn.key}`,
      },
      body: envelope,
      signal: AbortSignal.timeout(5000),
    });
  } catch (sendErr) {
    console.error('[monitoring] failed to send event:', (sendErr as Error).message);
  }
}
