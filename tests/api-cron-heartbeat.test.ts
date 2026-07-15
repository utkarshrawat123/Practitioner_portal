import { describe, it, expect, afterEach } from 'vitest';

afterEach(() => {
  delete process.env.CRON_SECRET;
});

function get(auth?: string): Request {
  return new Request('http://x/api/cron/heartbeat', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe('GET /api/cron/heartbeat', () => {
  it('fires and returns a timestamp when no secret is configured', async () => {
    const { GET } = await import('@/app/api/cron/heartbeat/route');
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.firedAt).toBe('string');
  });

  it('rejects requests without the correct Bearer secret when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 's3cret';
    const { GET } = await import('@/app/api/cron/heartbeat/route');
    expect((await GET(get())).status).toBe(401);
    expect((await GET(get('Bearer wrong'))).status).toBe(401);
    expect((await GET(get('Bearer s3cret'))).status).toBe(200);
  });
});
