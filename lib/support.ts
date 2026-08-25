/**
 * Contact configuration. The single source of truth for any address or link the
 * app shows to a practitioner or sends to a third party.
 *
 * Every getter returns `null` when unset, and every caller MUST omit the contact
 * rather than substitute one. A missing support address is a visible gap that
 * /api/admin/readiness reports; a WRONG support address is invisible and reaches
 * real practitioners. Absence is the safe failure.
 */

const clean = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : null;
};

/** Address practitioners are told to contact. Null when unset — omit the line. */
export function supportEmail(): string | null {
  return clean(process.env.SUPPORT_EMAIL);
}

/**
 * The private Facebook group. Null when unset — hide the link entirely.
 * NOTE: NEXT_PUBLIC_* is baked in at build time, so client components must
 * receive this as a prop from a server page, not read it directly.
 */
export function fbGroupUrl(): string | null {
  return clean(process.env.NEXT_PUBLIC_FB_GROUP_URL);
}

/** Identifies this app to third-party sites. Contact included only when known. */
export function outboundUserAgent(purpose?: string): string {
  const email = supportEmail();
  const inner = [email ? `+${email}` : null, purpose ?? null].filter(Boolean).join('; ');
  return inner
    ? `WildNutritionPractitionerPortal/1.0 (${inner})`
    : 'WildNutritionPractitionerPortal/1.0';
}
