import { createAuthToken, findByEmail } from '@/lib/db';
import { portalUrl } from '@/lib/codes';

export interface MagicLinkSender {
  name: string;
  send(input: { email: string; url: string }): Promise<void>;
}

const mockSender: MagicLinkSender = {
  name: 'mock',
  async send({ email, url }) {
    console.log(`[mock magic-link] login link for ${email}: ${url}`);
  },
};

/**
 * Mailchimp's marketing API cannot send transactional mail; a live sender
 * (Mandrill/SMTP) drops in here when credentials exist.
 */
export function getMagicLinkSender(): MagicLinkSender {
  return mockSender;
}

/** Always resolves; devLink is only populated when the sender is the mock. */
export async function requestLoginLink(email: string): Promise<{ devLink: string | null }> {
  const practitioner = await findByEmail(email);
  if (!practitioner || practitioner.status !== 'approved') return { devLink: null };
  const token = await createAuthToken(practitioner.id);
  const url = `${portalUrl()}/api/auth/verify?token=${token}`;
  const sender = getMagicLinkSender();
  await sender.send({ email: practitioner.email, url });
  return { devLink: sender.name === 'mock' ? url : null };
}
