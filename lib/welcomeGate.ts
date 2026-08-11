// Per-login gate for the Welcome takeover.
//
// Unlike the permanent `has_seen_welcome` column (which fires only for a
// practitioner's very first login, ever), this is a SESSION cookie that plays
// the Welcome experience once per login session — for new AND existing
// practitioners. The login routes CLEAR it (so the takeover shows on the next
// dashboard load); dismissing the takeover SETS it (so it doesn't replay while
// the practitioner navigates the app). Because it's a session cookie (no
// Max-Age), it also naturally clears when the browser session ends.
//
// Cookie flags mirror the wn_session cookie (see lib/practitionerAuth.ts):
// HttpOnly, Path=/, SameSite=Lax — no Secure, matching repo convention.

export const WELCOME_COOKIE = 'wn_welcome';

/** Set when the Welcome takeover is dismissed — a session cookie (no Max-Age). */
export function welcomeSeenCookieHeader(): string {
  return `${WELCOME_COOKIE}=1; HttpOnly; Path=/; SameSite=Lax`;
}

/** Cleared at every login so the takeover replays on the next dashboard load. */
export function clearWelcomeCookieHeader(): string {
  return `${WELCOME_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
