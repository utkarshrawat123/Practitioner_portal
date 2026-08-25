import { describe, it, expect, beforeEach, afterEach } from 'vitest';

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.SUPPORT_EMAIL;
  delete process.env.SUPPORT_EMAIL;
});
afterEach(() => {
  if (saved === undefined) delete process.env.SUPPORT_EMAIL;
  else process.env.SUPPORT_EMAIL = saved;
});

const WELCOME = {
  name: 'Sarah Whitfield',
  email: 'sarah@example.com',
  code: 'WN-SARAH',
  link: 'https://x/r/WN-SARAH',
};

describe('email templates and the support address', () => {
  it('welcome email contains no personal gmail address', async () => {
    const { welcomeEmail } = await import('@/lib/emails/templates');
    expect(welcomeEmail(WELCOME).html).not.toMatch(/gmail\.com/i);
  });

  it('welcome email omits the contact line entirely when SUPPORT_EMAIL is unset', async () => {
    const { welcomeEmail } = await import('@/lib/emails/templates');
    expect(welcomeEmail(WELCOME).html).not.toContain('Questions? Reach us at');
  });

  it('welcome email shows the configured address when set', async () => {
    process.env.SUPPORT_EMAIL = 'practitioners@example.org';
    const { welcomeEmail } = await import('@/lib/emails/templates');
    expect(welcomeEmail(WELCOME).html).toContain('Questions? Reach us at practitioners@example.org');
  });

  it('certification-request email follows the same rule', async () => {
    const { certificationRequestEmail } = await import('@/lib/emails/templates');
    const html = certificationRequestEmail({ name: 'Ali Khan', uploadUrl: 'https://x/u/abc' }).html;
    expect(html).not.toMatch(/gmail\.com/i);
    expect(html).not.toContain('Questions? Reach us at');
  });
});
