import { createHash } from 'crypto';
import type { EmailProvider, SyncResult } from './types';

const mockEmail: EmailProvider = {
  name: 'mock',
  async sendWelcome({ name, email, code, link }): Promise<SyncResult> {
    console.log(`[mock email] would enrol ${email} in welcome sequence with code ${code} / ${link}`);
    return { ok: true, detail: `Mock mode: welcome email for ${email} logged only (${name}, ${code}).` };
  },
};

/**
 * Upserts the practitioner into the Mailchimp audience with merge fields
 * AFFCODE/AFFLINK and tags them "practitioner" — a Mailchimp Customer Journey
 * triggered on that tag sends the welcome sequence.
 */
const mailchimpEmail: EmailProvider = {
  name: 'mailchimp',
  async sendWelcome({ name, email, code, link }): Promise<SyncResult> {
    const apiKey = process.env.MAILCHIMP_API_KEY!;
    const audienceId = process.env.MAILCHIMP_AUDIENCE_ID!;
    const dc = apiKey.split('-').pop();
    const memberHash = createHash('md5').update(email.toLowerCase()).digest('hex');
    const base = `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${memberHash}`;
    const auth = 'Basic ' + Buffer.from(`anystring:${apiKey}`).toString('base64');
    const [firstName, ...rest] = name.trim().split(/\s+/);
    try {
      const upsert = await fetch(base, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({
          email_address: email,
          status_if_new: 'subscribed',
          merge_fields: {
            FNAME: firstName,
            LNAME: rest.join(' '),
            AFFCODE: code,
            AFFLINK: link,
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!upsert.ok) {
        return { ok: false, detail: `Mailchimp upsert failed (${upsert.status}): ${await upsert.text()}` };
      }
      const tag = await fetch(`${base}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ tags: [{ name: 'practitioner', status: 'active' }] }),
        signal: AbortSignal.timeout(10000),
      });
      if (!tag.ok) {
        return { ok: false, detail: `Mailchimp tagging failed (${tag.status}): ${await tag.text()}` };
      }
      return { ok: true, detail: `Mailchimp: ${email} enrolled with code ${code}, tagged "practitioner".` };
    } catch (err) {
      return { ok: false, detail: `Mailchimp request error: ${(err as Error).message}` };
    }
  },
};

export function getEmailProvider(): EmailProvider {
  if (process.env.MAILCHIMP_API_KEY && process.env.MAILCHIMP_AUDIENCE_ID) {
    return mailchimpEmail;
  }
  return mockEmail;
}
