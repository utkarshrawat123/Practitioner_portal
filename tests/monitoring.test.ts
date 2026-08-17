import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { captureException } from '@/lib/monitoring';

const realFetch = global.fetch;

beforeEach(() => { delete process.env.SENTRY_DSN; });
afterEach(() => { global.fetch = realFetch; vi.restoreAllMocks(); });

describe('captureException', () => {
  it('no-ops (no network call) without SENTRY_DSN — mock-until-keyed', async () => {
    const mock = vi.fn();
    global.fetch = mock as unknown as typeof fetch;
    await captureException(new Error('boom'), { where: 'test' });
    expect(mock).not.toHaveBeenCalled();
  });

  it('posts a Sentry envelope derived from the DSN when keyed', async () => {
    process.env.SENTRY_DSN = 'https://publickey@o123456.ingest.sentry.io/7890';
    const mock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = mock as unknown as typeof fetch;

    await captureException(new Error('kaboom'), { where: 'worker.scheduled' });

    expect(mock).toHaveBeenCalledOnce();
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toBe('https://o123456.ingest.sentry.io/api/7890/envelope/');
    expect((init.headers as Record<string, string>)['X-Sentry-Auth']).toContain('sentry_key=publickey');
    const body = String(init.body);
    expect(body).toContain('kaboom');
    expect(body).toContain('worker.scheduled');
  });

  it('never throws — a monitoring failure must not take down the request', async () => {
    process.env.SENTRY_DSN = 'https://k@o1.ingest.sentry.io/2';
    global.fetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    await expect(captureException(new Error('x'))).resolves.toBeUndefined();
  });

  it('ignores a malformed DSN instead of crashing', async () => {
    process.env.SENTRY_DSN = 'not-a-dsn';
    const mock = vi.fn();
    global.fetch = mock as unknown as typeof fetch;
    await captureException(new Error('x'));
    expect(mock).not.toHaveBeenCalled();
  });
});
