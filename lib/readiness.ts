import { getD1Binding, getR2Binding } from '@/lib/db/binding';

export type CheckStatus = 'live' | 'mock' | 'missing';

export interface ReadinessCheck {
  key: string;
  label: string;
  status: CheckStatus;
  required: boolean;
  detail: string;
}

export interface ReadinessReport {
  ready: boolean;
  checks: ReadinessCheck[];
  missingRequired: string[];
  warnings: string[];
}

const set = (v: string | undefined): boolean => Boolean(v && v.trim());

/**
 * Go-live readiness: which integrations are live, which are still mock, and what
 * is missing. Built for the moment the company credentials arrive — set the
 * secrets, hit /api/admin/readiness, and see whether they actually took effect.
 *
 * NEVER returns a secret value, only whether one is present. Even so the route
 * that serves this is admin-gated.
 *
 * `bindings` is injectable so tests can assert the ready state; in the Worker it
 * defaults to the real D1/R2 bindings.
 */
export function readinessReport(
  bindings?: { hasD1: boolean; hasR2: boolean }
): ReadinessReport {
  const hasD1 = bindings ? bindings.hasD1 : getD1Binding() !== null;
  const hasR2 = bindings ? bindings.hasR2 : getR2Binding() !== null;

  const emailLive = set(process.env.RESEND_API_KEY) && set(process.env.EMAIL_FROM);
  const shopifyLive =
    set(process.env.SHOPIFY_STORE_DOMAIN) && set(process.env.SHOPIFY_ADMIN_TOKEN);
  const aiLive =
    set(process.env.GEMINI_API_KEY) ||
    set(process.env.GEMINI_API_KEY2) ||
    set(process.env.ANTHROPIC_API_KEY);

  const portalUrl = (process.env.PORTAL_URL ?? '').trim();
  const portalIsLocal = /localhost|127.0.0.1/i.test(portalUrl);

  const checks: ReadinessCheck[] = [
    {
      key: 'database',
      label: 'D1 database binding (DB)',
      status: hasD1 ? 'live' : 'missing',
      required: true,
      detail: hasD1
        ? 'Bound. Schema + migrations self-apply on first request.'
        : 'Not bound. Set a real database_id in wrangler.toml [[d1_databases]].',
    },
    {
      key: 'storage',
      label: 'R2 bucket binding (BUCKET)',
      status: hasR2 ? 'live' : 'missing',
      required: true,
      detail: hasR2 ? 'Bound.' : 'Not bound. Create the bucket and deploy.',
    },
    {
      key: 'r2_public_base',
      label: 'R2 public base URL',
      status: set(process.env.R2_PUBLIC_BASE) ? 'live' : 'missing',
      required: true,
      detail: set(process.env.R2_PUBLIC_BASE)
        ? 'Set. Public media URLs will use it.'
        : 'R2_PUBLIC_BASE unset — media falls back to the auth-gated /api/files route.',
    },
    {
      key: 'admin_password',
      label: 'Admin password',
      status: set(process.env.ADMIN_PASSWORD) ? 'live' : 'missing',
      required: true,
      detail: set(process.env.ADMIN_PASSWORD) ? 'Set.' : 'ADMIN_PASSWORD unset — /admin cannot be used.',
    },
    {
      key: 'session_secret',
      label: 'Session secret',
      status: set(process.env.SESSION_SECRET) ? 'live' : 'missing',
      required: true,
      detail: set(process.env.SESSION_SECRET)
        ? 'Set. Signs practitioner sessions + certificate-upload tokens.'
        : 'SESSION_SECRET unset — practitioner sessions cannot be signed.',
    },
    {
      key: 'cron_secret',
      label: 'Cron secret',
      status: set(process.env.CRON_SECRET) ? 'live' : 'missing',
      required: true,
      detail: set(process.env.CRON_SECRET)
        ? 'Set. Scheduled jobs authorise with it.'
        : 'CRON_SECRET unset — cron routes are unauthenticated.',
    },
    {
      key: 'portal_url',
      label: 'Portal URL',
      status: portalUrl && !portalIsLocal ? 'live' : 'missing',
      required: true,
      detail: !portalUrl
        ? 'PORTAL_URL unset — links will point at localhost.'
        : portalIsLocal
          ? 'PORTAL_URL still points at localhost. Magic links, invites and cron self-calls would all be unreachable for practitioners.'
          : 'Set. Used for magic links, invites and cron self-calls.',
    },
    {
      key: 'email',
      label: 'Transactional email (Resend)',
      status: emailLive ? 'live' : 'mock',
      required: true,
      detail: emailLive
        ? 'Live. Magic links and notifications will send.'
        : 'Mock. Needs BOTH RESEND_API_KEY and a domain-verified EMAIL_FROM; until then magic links return an on-screen devLink.',
    },
    {
      key: 'ai',
      label: 'AI assistant (Gemini / Anthropic)',
      status: aiLive ? 'live' : 'mock',
      required: true,
      detail: aiLive
        ? 'A key is present. Note Gemini still needs quota — a 429 degrades gracefully.'
        : 'Mock. Ask the Expert, Content Factory and Chat FAQ clustering stay dormant.',
    },
    {
      key: 'commerce',
      label: 'Shopify commerce',
      status: shopifyLive ? 'live' : 'mock',
      required: false,
      detail: shopifyLive
        ? 'Live. Real catalog + draft orders.'
        : 'Mock. Needs BOTH SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN; until then the mock catalog and mock pay page are used.',
    },
    {
      key: 'shopify_webhook',
      label: 'Shopify webhook secret',
      status: set(process.env.SHOPIFY_WEBHOOK_SECRET) ? 'live' : 'missing',
      required: false,
      detail: set(process.env.SHOPIFY_WEBHOOK_SECRET)
        ? 'Set. Order webhooks will verify.'
        : 'SHOPIFY_WEBHOOK_SECRET unset — /api/webhooks/shopify rejects every call with 401.',
    },
    {
      key: 'support_email',
      label: 'Support address shown to practitioners',
      status: set(process.env.SUPPORT_EMAIL) ? 'live' : 'missing',
      required: true,
      detail: set(process.env.SUPPORT_EMAIL)
        ? 'Set. Emails, the sidebar help link and error copy use it.'
        : 'SUPPORT_EMAIL unset — every contact line is omitted. Practitioners are given no way to reach the team.',
    },
    {
      key: 'fb_group',
      label: 'Private Facebook group URL',
      status: set(process.env.NEXT_PUBLIC_FB_GROUP_URL) ? 'live' : 'missing',
      required: false,
      detail: set(process.env.NEXT_PUBLIC_FB_GROUP_URL)
        ? 'Set. The community page links to it.'
        : 'NEXT_PUBLIC_FB_GROUP_URL unset — the group link is hidden rather than pointing somewhere wrong.',
    },
    {
      key: 'd1_id',
      label: 'D1 database id in wrangler.toml',
      status: set(process.env.CLOUDFLARE_D1_ID) ? 'live' : 'missing',
      required: true,
      detail: set(process.env.CLOUDFLARE_D1_ID)
        ? 'Recorded. Confirms wrangler.toml no longer ships PLACEHOLDER_D1_ID.'
        : 'CLOUDFLARE_D1_ID unset. Set it alongside the real database_id in wrangler.toml so this check can confirm the placeholder was replaced.',
    },
    {
      key: 'monitoring',
      label: 'Error monitoring (Sentry)',
      status: set(process.env.SENTRY_DSN) ? 'live' : 'mock',
      required: false,
      detail: set(process.env.SENTRY_DSN)
        ? 'Live. Worker fetch + scheduled errors report.'
        : 'Mock. Errors go to console only (visible via wrangler tail / Workers Logs).',
    },
  ];

  const missingRequired = checks
    .filter((c) => c.required && c.status !== 'live')
    .map((c) => c.key);

  const warnings: string[] = [];
  if (shopifyLive && !set(process.env.SHOPIFY_WEBHOOK_SECRET)) {
    warnings.push(
      'Shopify is configured but SHOPIFY_WEBHOOK_SECRET is unset: orders would never reconcile, so sales and referral credit would silently never register.'
    );
  }
  if (portalIsLocal) {
    warnings.push(
      'PORTAL_URL points at localhost. Magic-link sign-in, referral links and cron self-calls would all target the local machine, so nothing would work for a real practitioner.'
    );
  }
  if (!set(process.env.SUPPORT_EMAIL)) {
    warnings.push(
      'SUPPORT_EMAIL is unset, so every "contact us" line is omitted. This is deliberate — the app never invents an address — but practitioners currently have no contact route.'
    );
  }
  if (set(process.env.TURSO_DATABASE_URL)) {
    warnings.push(
      'TURSO_DATABASE_URL is set. It is a leftover from the pre-Cloudflare platform and is ignored whenever the D1 binding is present.'
    );
  }

  return { ready: missingRequired.length === 0, checks, missingRequired, warnings };
}
