import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock nodemailer before importing the module under test.
const sendMail = vi.fn();
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

import { smtpConfigured, sendSmtpEmail } from '@/lib/providers/smtp';
import { getMagicLinkSender } from '@/lib/magicLink';
import { getEmailProvider } from '@/lib/providers/email';

beforeEach(() => {
  sendMail.mockReset();
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  delete process.env.EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAILCHIMP_API_KEY;
  delete process.env.MAILCHIMP_AUDIENCE_ID;
});

describe('smtp configuration', () => {
  it('needs both user and app password', () => {
    expect(smtpConfigured()).toBe(false);
    process.env.GMAIL_USER = 'sender@gmail.com';
    expect(smtpConfigured()).toBe(false);
    process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop';
    expect(smtpConfigured()).toBe(true);
  });
});

describe('sendSmtpEmail', () => {
  beforeEach(() => {
    process.env.GMAIL_USER = 'sender@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop';
  });

  it('sends and reports success, stripping spaces from the app password', async () => {
    sendMail.mockResolvedValue({ messageId: '<abc@gmail.com>' });
    const res = await sendSmtpEmail({ to: 'jane@example.com', subject: 'Hi', html: '<p>Hi</p>' });
    expect(res.ok).toBe(true);
    expect(sendMail).toHaveBeenCalledOnce();
    const { createTransport } = (await import('nodemailer')).default as unknown as {
      createTransport: ReturnType<typeof vi.fn>;
    };
    const transportOpts = createTransport.mock.calls.at(-1)![0];
    expect(transportOpts.auth.pass).toBe('abcdefghijklmnop'); // spaces stripped
    const mailOpts = sendMail.mock.calls[0][0];
    expect(mailOpts.to).toBe('jane@example.com');
    expect(mailOpts.replyTo).toBe('utkarshrawatofficial@gmail.com');
  });

  it('returns ok=false when sendMail rejects (never throws)', async () => {
    sendMail.mockRejectedValue(new Error('SMTP auth failed'));
    const res = await sendSmtpEmail({ to: 'jane@example.com', subject: 'Hi', html: '<p>Hi</p>' });
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('SMTP auth failed');
  });
});

describe('provider selection with Gmail SMTP', () => {
  beforeEach(() => {
    process.env.GMAIL_USER = 'sender@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop';
  });

  it('welcome email uses the smtp provider', () => {
    expect(getEmailProvider().name).toBe('smtp');
  });

  it('magic-link uses the smtp sender', () => {
    expect(getMagicLinkSender().name).toBe('smtp');
  });
});
