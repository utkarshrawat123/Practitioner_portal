const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // no 0/O/1/I/L ambiguity
const MAX_ATTEMPTS = 50;

export async function generateCode(
  fullName: string,
  isTaken: (code: string) => boolean | Promise<boolean>
): Promise<string> {
  const parts = fullName.trim().toUpperCase().split(/\s+/);
  const rawSurname = parts[parts.length - 1] ?? '';
  const surname = rawSurname.replace(/[^A-Z]/g, '').slice(0, 6) || 'PRACT';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    const code = `WN-${surname}-${suffix}`;
    if (!(await isTaken(code))) return code;
  }
  throw new Error('Could not generate a unique affiliate code');
}

export function portalUrl(): string {
  return process.env.PORTAL_URL || 'http://localhost:3100';
}

/** Practitioner-facing referral link — routes through the portal so clicks are counted. */
export function referralLink(code: string): string {
  return `${portalUrl()}/r/${code}`;
}

/** Where /r/{code} redirects to — the Shopify discount deep link with attribution UTMs. */
export function shopifyDiscountUrl(code: string): string {
  return `https://www.wildnutrition.com/discount/${code}?utm_source=practitioner&utm_medium=referral&utm_campaign=${code}`;
}
