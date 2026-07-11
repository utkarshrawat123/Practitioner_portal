import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resendConfigured, sendResendEmail } from '@/lib/providers/resend';
import { getMagicLinkSender } from '@/lib/magicLink';

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
});
afterEach(() => vi.unstubAllGlobals());

describe('resend configuration', () => {
  it('is not configured without both key and from address', () => {
    expect(resendConfigured()).toBe(false);
    process.env.RESEND_API_KEY = 're_test';
    expect(resendConfigured()).toBe(false); // from still missing
    process.env.EMAIL_FROM = 'Wild Nutrition <hi@example.com>';
    expect(resendConfigured()).toBe(true);
  });
});

describe('sendResendEmail', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'Wild Nutrition <hi@example.com>';
  });

  it('posts to the Resend API and reports success', async () => {
    const fetchMock = vi.fn(async () => new Response('{"id":"abc"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await sendResendEmail({ to: 'jane@example.com', subject: 'Hi', html: '<p>Hi</p>' });
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe('jane@example.com');
    expect(body.from).toBe('Wild Nutrition <hi@example.com>');
  });

  it('returns ok=false on API failure (never throws)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"bad"}', { status: 422 })));
    const res = await sendResendEmail({ to: 'jane@example.com', subject: 'Hi', html: '<p>Hi</p>' });
    expect(res.ok).toBe(false);
  });

  it('returns ok=false on network error (never throws)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
    const res = await sendResendEmail({ to: 'jane@example.com', subject: 'Hi', html: '<p>Hi</p>' });
    expect(res.ok).toBe(false);
  });
});

describe('magic-link sender selection', () => {
  it('uses the mock sender without Resend credentials', () => {
    expect(getMagicLinkSender().name).toBe('mock');
  });

  it('uses the Resend sender when configured', () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'Wild Nutrition <hi@example.com>';
    expect(getMagicLinkSender().name).toBe('resend');
  });
});
