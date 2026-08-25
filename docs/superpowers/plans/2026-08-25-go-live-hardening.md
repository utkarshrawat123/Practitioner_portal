# Go-Live Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the portal safe to launch the moment credentials arrive, by removing every hardcoded personal/placeholder contact detail from shippable code and making `/api/admin/readiness` catch the "present but wrong" class of misconfiguration it currently misses.

**Architecture:** A single `lib/support.ts` module becomes the only source of contact configuration, returning `null` when unset so every consumer **omits** the contact rather than printing a wrong one. Server-side consumers read it directly; the two client components receive it as a prop from their server page, because `NEXT_PUBLIC_*` values are baked in at build time and a Worker secret would never reach them. `lib/readiness.ts` gains checks for the placeholders that are currently invisible.

**Tech Stack:** Next.js 15 (App Router) on Cloudflare Workers via OpenNext, TypeScript, vitest, D1/R2 bindings.

## Global Constraints

- **Branch:** `feat/go-live-hardening`, cut from `cloudflare-migration`. Small branch, ends green.
- **Node is not on PATH in tool shells.** Every shell starts with:
  `export PATH="/c/Users/UtkarshRawat/AppData/Local/node/node-v22.20.0-win-x64:$PATH"`
- **TDD, always.** Failing test first, then the minimal implementation.
- **Gates before "done":** `npm test` (baseline **437 passing / 97 files**) AND `npm run build`. This branch touches an API route's response shape, so `npm run preview:cf` is also required (Task 8).
- **`npm run build` corrupts `.next` if a dev server is running.** Stop dev first; if it breaks, `rm -rf .next` and restart.
- **Mock-until-keyed is sacred.** Nothing here may make a feature require a key to boot. Absence must degrade, never crash.
- **Never reference `care@wildnutrition.com`** (repo convention, `CLAUDE.md`).
- **No secret values may ever appear in the readiness response** — only whether something is set.
- The real support address and Facebook group URL are **not yet known**. Nothing in this plan hardcodes a replacement; the code must work correctly with both unset.

---

### Task 1: The `lib/support.ts` module

**Files:**
- Create: `lib/support.ts`
- Test: `tests/support.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `supportEmail(): string | null` — trimmed `SUPPORT_EMAIL`, or `null` when unset/blank
  - `fbGroupUrl(): string | null` — trimmed `NEXT_PUBLIC_FB_GROUP_URL`, or `null`
  - `outboundUserAgent(purpose?: string): string` — always returns a UA string; includes the contact only when `SUPPORT_EMAIL` is set

- [ ] **Step 1: Write the failing test**

```ts
// tests/support.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = { SUPPORT_EMAIL: process.env.SUPPORT_EMAIL, NEXT_PUBLIC_FB_GROUP_URL: process.env.NEXT_PUBLIC_FB_GROUP_URL };
  delete process.env.SUPPORT_EMAIL;
  delete process.env.NEXT_PUBLIC_FB_GROUP_URL;
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe('supportEmail', () => {
  it('returns null when SUPPORT_EMAIL is unset', async () => {
    const { supportEmail } = await import('@/lib/support');
    expect(supportEmail()).toBeNull();
  });

  it('returns null when SUPPORT_EMAIL is blank whitespace', async () => {
    process.env.SUPPORT_EMAIL = '   ';
    const { supportEmail } = await import('@/lib/support');
    expect(supportEmail()).toBeNull();
  });

  it('returns the trimmed address when set', async () => {
    process.env.SUPPORT_EMAIL = '  hello@example.org  ';
    const { supportEmail } = await import('@/lib/support');
    expect(supportEmail()).toBe('hello@example.org');
  });

  it('never falls back to a personal address', async () => {
    const { supportEmail } = await import('@/lib/support');
    expect(supportEmail()).not.toMatch(/gmail\.com/i);
  });
});

describe('fbGroupUrl', () => {
  it('returns null when unset — no guessed group URL', async () => {
    const { fbGroupUrl } = await import('@/lib/support');
    expect(fbGroupUrl()).toBeNull();
  });

  it('returns the URL when set', async () => {
    process.env.NEXT_PUBLIC_FB_GROUP_URL = 'https://www.facebook.com/groups/real-group';
    const { fbGroupUrl } = await import('@/lib/support');
    expect(fbGroupUrl()).toBe('https://www.facebook.com/groups/real-group');
  });
});

describe('outboundUserAgent', () => {
  it('omits the contact when SUPPORT_EMAIL is unset', async () => {
    const { outboundUserAgent } = await import('@/lib/support');
    const ua = outboundUserAgent('membership verification');
    expect(ua).toBe('WildNutritionPractitionerPortal/1.0 (membership verification)');
    expect(ua).not.toContain('@');
  });

  it('includes the contact when SUPPORT_EMAIL is set', async () => {
    process.env.SUPPORT_EMAIL = 'hello@example.org';
    const { outboundUserAgent } = await import('@/lib/support');
    expect(outboundUserAgent('membership verification')).toBe(
      'WildNutritionPractitionerPortal/1.0 (+hello@example.org; membership verification)'
    );
  });

  it('works with no purpose given', async () => {
    process.env.SUPPORT_EMAIL = 'hello@example.org';
    const { outboundUserAgent } = await import('@/lib/support');
    expect(outboundUserAgent()).toBe('WildNutritionPractitionerPortal/1.0 (+hello@example.org)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/support.test.ts`
Expected: FAIL — cannot resolve `@/lib/support`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/support.ts

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
  return inner ? `WildNutritionPractitionerPortal/1.0 (${inner})` : 'WildNutritionPractitionerPortal/1.0';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/support.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/support.ts tests/support.test.ts
git commit -m "feat(support): single source of truth for contact configuration"
```

---

### Task 2: Practitioner-facing emails and SMTP reply-to

**Files:**
- Modify: `lib/emails/templates.ts` (two "Questions? Reach us at…" lines, ~`:32` and `:52`)
- Modify: `lib/providers/smtp.ts:45` (`replyTo`)
- Test: `tests/emails-support.test.ts`

**Interfaces:**
- Consumes: `supportEmail()` from Task 1.
- Produces: no new exports. `welcomeEmail` and `certificationRequestEmail` keep their existing signatures and `RenderedEmail` return type.

- [ ] **Step 1: Write the failing test**

```ts
// tests/emails-support.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

let saved: string | undefined;
beforeEach(() => { saved = process.env.SUPPORT_EMAIL; delete process.env.SUPPORT_EMAIL; });
afterEach(() => { if (saved === undefined) delete process.env.SUPPORT_EMAIL; else process.env.SUPPORT_EMAIL = saved; });

const WELCOME = { name: 'Sarah Whitfield', email: 'sarah@example.com', code: 'WN-SARAH', link: 'https://x/r/WN-SARAH' };

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/emails-support.test.ts`
Expected: FAIL — the templates still contain the gmail address.

- [ ] **Step 3: Write minimal implementation**

In `lib/emails/templates.ts`, add the import at the top of the file:

```ts
import { supportEmail } from '@/lib/support';
```

Add this helper near the top of the file, below the imports:

```ts
/** The contact line, or an empty string when no support address is configured. */
function contactLine(): string {
  const email = supportEmail();
  return email ? `\n  <p style="font-size:13px;color:#666">Questions? Reach us at ${email}</p>` : '';
}
```

Replace **both** occurrences of this exact line (in `welcomeEmail` and in `certificationRequestEmail`):

```html
  <p style="font-size:13px;color:#666">Questions? Reach us at utkarshrawatofficial@gmail.com</p>
```

with the interpolation (note: no leading spaces — `contactLine()` supplies its own newline and indentation):

```
${contactLine()}
```

In `lib/providers/smtp.ts`, add the import:

```ts
import { supportEmail } from '@/lib/support';
```

and replace line 45:

```ts
      replyTo: 'utkarshrawatofficial@gmail.com',
```

with:

```ts
      replyTo: supportEmail() ?? undefined,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/emails-support.test.ts`
Expected: PASS (4 tests).

Then run the existing email tests to prove nothing else broke:
Run: `npx vitest run tests/emails.test.ts tests/api-apply.test.ts`
Expected: PASS. If an existing test asserts the gmail address, update that assertion — it was encoding the bug.

- [ ] **Step 5: Commit**

```bash
git add lib/emails/templates.ts lib/providers/smtp.ts tests/emails-support.test.ts
git commit -m "fix(email): take the support address from config, omit it when unset"
```

---

### Task 3: Chat alerts must not email a personal inbox

**Files:**
- Modify: `lib/chat/alerts.ts:6-8` (`alertRecipient`) and the send loop at `:44-52`
- Test: `tests/chat-alerts-recipient.test.ts`

**Interfaces:**
- Consumes: `supportEmail()` from Task 1.
- Produces: `alertRecipient(): string | null` — **signature change**, was `string`. `sendChatAlerts()` gains `skippedNoRecipient: boolean` in its returned summary; existing fields `checked`, `alerted`, `skippedNoSmtp` are unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// tests/chat-alerts-recipient.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = { ADMIN_ALERT_EMAIL: process.env.ADMIN_ALERT_EMAIL, SUPPORT_EMAIL: process.env.SUPPORT_EMAIL };
  delete process.env.ADMIN_ALERT_EMAIL;
  delete process.env.SUPPORT_EMAIL;
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe('alertRecipient', () => {
  it('is null when neither ADMIN_ALERT_EMAIL nor SUPPORT_EMAIL is set', async () => {
    const { alertRecipient } = await import('@/lib/chat/alerts');
    expect(alertRecipient()).toBeNull();
  });

  it('falls back to the support address', async () => {
    process.env.SUPPORT_EMAIL = 'practitioners@example.org';
    const { alertRecipient } = await import('@/lib/chat/alerts');
    expect(alertRecipient()).toBe('practitioners@example.org');
  });

  it('prefers ADMIN_ALERT_EMAIL over the support address', async () => {
    process.env.SUPPORT_EMAIL = 'practitioners@example.org';
    process.env.ADMIN_ALERT_EMAIL = 'ops@example.org';
    const { alertRecipient } = await import('@/lib/chat/alerts');
    expect(alertRecipient()).toBe('ops@example.org');
  });

  it('never returns a personal gmail address', async () => {
    const { alertRecipient } = await import('@/lib/chat/alerts');
    expect(alertRecipient() ?? '').not.toMatch(/gmail\.com/i);
  });
});

describe('sendChatAlerts with no recipient', () => {
  it('reports skippedNoRecipient instead of emailing', async () => {
    const { sendChatAlerts } = await import('@/lib/chat/alerts');
    const res = await sendChatAlerts();
    expect(res.skippedNoRecipient).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chat-alerts-recipient.test.ts`
Expected: FAIL — `alertRecipient()` returns the gmail string, and `skippedNoRecipient` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `lib/chat/alerts.ts`, add the import:

```ts
import { supportEmail } from '@/lib/support';
```

Replace `alertRecipient`:

```ts
/**
 * Where missed-message alerts go: an explicit ops inbox, else the support
 * address. Null when neither is configured — alerts are then skipped rather
 * than delivered somewhere arbitrary.
 */
export function alertRecipient(): string | null {
  return (process.env.ADMIN_ALERT_EMAIL ?? '').trim() || supportEmail();
}
```

Change the return type of `sendChatAlerts` to include the new field:

```ts
export async function sendChatAlerts(now = new Date()): Promise<{
  checked: number;
  alerted: number;
  skippedNoSmtp: boolean;
  skippedNoRecipient: boolean;
}> {
```

Inside `sendChatAlerts`, after `const smtp = smtpConfigured();` add:

```ts
  const to = alertRecipient();
```

Change the send condition from `if (smtp) {` to:

```ts
    if (smtp && to) {
```

and the send call's `to:` field from `to: alertRecipient(),` to:

```ts
        to,
```

Change the final return to:

```ts
  return { checked: due.length, alerted, skippedNoSmtp: !smtp, skippedNoRecipient: !to };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chat-alerts-recipient.test.ts tests/chat-alerts.test.ts`
Expected: PASS. If `tests/chat-alerts.test.ts` asserts the old return shape, extend the assertion rather than weakening it.

- [ ] **Step 5: Commit**

```bash
git add lib/chat/alerts.ts tests/chat-alerts-recipient.test.ts
git commit -m "fix(chat): skip alerts when no recipient is configured"
```

---

### Task 4: Outbound User-Agent strings

**Files:**
- Modify: `lib/registers/http.ts:1-2`
- Modify: `lib/media/thumbnail.ts:33`
- Test: `tests/outbound-user-agent.test.ts`

**Interfaces:**
- Consumes: `outboundUserAgent(purpose?)` from Task 1.
- Produces: no new exports. `politeFetch(url)` keeps its signature.

This matters beyond tidiness: these UA strings are sent to **external professional-register websites**, publishing a personal address to third parties on every verification request.

- [ ] **Step 1: Write the failing test**

```ts
// tests/outbound-user-agent.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let saved: string | undefined;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  saved = process.env.SUPPORT_EMAIL;
  delete process.env.SUPPORT_EMAIL;
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  if (saved === undefined) delete process.env.SUPPORT_EMAIL; else process.env.SUPPORT_EMAIL = saved;
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('register lookups', () => {
  it('send no personal address in the User-Agent when SUPPORT_EMAIL is unset', async () => {
    let seen = '';
    globalThis.fetch = vi.fn(async (_url: unknown, init?: { headers?: Record<string, string> }) => {
      seen = init?.headers?.['User-Agent'] ?? '';
      return new Response('<html></html>', { status: 200 });
    }) as unknown as typeof fetch;

    const { politeFetch } = await import('@/lib/registers/http');
    await politeFetch('https://example.org/register');

    expect(seen).toContain('WildNutritionPractitionerPortal/1.0');
    expect(seen).not.toMatch(/gmail\.com/i);
    expect(seen).not.toContain('@');
  });

  it('include the configured contact when SUPPORT_EMAIL is set', async () => {
    process.env.SUPPORT_EMAIL = 'practitioners@example.org';
    let seen = '';
    globalThis.fetch = vi.fn(async (_url: unknown, init?: { headers?: Record<string, string> }) => {
      seen = init?.headers?.['User-Agent'] ?? '';
      return new Response('<html></html>', { status: 200 });
    }) as unknown as typeof fetch;

    const { politeFetch } = await import('@/lib/registers/http');
    await politeFetch('https://example.org/register');

    expect(seen).toContain('+practitioners@example.org');
    expect(seen).toContain('membership verification');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/outbound-user-agent.test.ts`
Expected: FAIL — the UA contains the gmail address.

Note: `politeFetch` rate-limits to one request per second via a module-level `lastRequestAt`. Each `await import()` in a fresh test file gets a fresh module, but two calls in one test file may sleep ~1s. That is expected; do not remove the rate limit to speed up tests.

- [ ] **Step 3: Write minimal implementation**

In `lib/registers/http.ts`, replace the constant at lines 1-2:

```ts
const USER_AGENT =
  'WildNutritionPractitionerPortal/1.0 (+utkarshrawatofficial@gmail.com; membership verification)';
```

with an import and a call — the value must be read per request, not frozen at module load, so a secret set at runtime takes effect:

```ts
import { outboundUserAgent } from '@/lib/support';

const userAgent = (): string => outboundUserAgent('membership verification');
```

Then find every use of `USER_AGENT` in that file and replace it with `userAgent()`.

In `lib/media/thumbnail.ts`, add the import:

```ts
import { outboundUserAgent } from '@/lib/support';
```

and replace line 33:

```ts
      headers: { 'User-Agent': 'WildNutritionPractitionerPortal/1.0 (+utkarshrawatofficial@gmail.com)' },
```

with:

```ts
      headers: { 'User-Agent': outboundUserAgent() },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/outbound-user-agent.test.ts`
Expected: PASS (2 tests).

Then: `npx vitest run tests/registers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/registers/http.ts lib/media/thumbnail.ts tests/outbound-user-agent.test.ts
git commit -m "fix(http): stop publishing a personal address to third-party sites"
```

---

### Task 5: The duplicate-application error message

**Files:**
- Modify: `app/api/apply/route.ts:56-61`
- Test: `tests/api-apply-duplicate-copy.test.ts`

**Interfaces:**
- Consumes: `supportEmail()` from Task 1.
- Produces: no signature change. The 409 body stays `{ error: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/api-apply-duplicate-copy.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
let saved: string | undefined;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-apply-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  saved = process.env.SUPPORT_EMAIL;
  delete process.env.SUPPORT_EMAIL;
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  if (saved === undefined) delete process.env.SUPPORT_EMAIL; else process.env.SUPPORT_EMAIL = saved;
});

function applyRequest(email: string): Request {
  return new Request('http://x/api/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Dupe Tester', email, registerBody: 'BANT', registerNumber: '12345',
      qualificationStatus: 'qualified',
    }),
  });
}

describe('duplicate application copy', () => {
  it('does not name a personal address when SUPPORT_EMAIL is unset', async () => {
    const { POST } = await import('@/app/api/apply/route');
    await POST(applyRequest('dupe@example.com'));
    const res = await POST(applyRequest('dupe@example.com'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).not.toMatch(/gmail\.com/i);
    expect(body.error).toContain('An application already exists');
  });

  it('names the configured address when set', async () => {
    process.env.SUPPORT_EMAIL = 'practitioners@example.org';
    const { POST } = await import('@/app/api/apply/route');
    await POST(applyRequest('dupe2@example.com'));
    const res = await POST(applyRequest('dupe2@example.com'));
    const body = await res.json();
    expect(body.error).toContain('practitioners@example.org');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api-apply-duplicate-copy.test.ts`
Expected: FAIL — the message contains the gmail address.

- [ ] **Step 3: Write minimal implementation**

In `app/api/apply/route.ts`, add the import:

```ts
import { supportEmail } from '@/lib/support';
```

Replace the 409 branch:

```ts
    if (err instanceof DuplicateEmailError) {
      const email = supportEmail();
      return NextResponse.json(
        {
          error: email
            ? `An application already exists for this email address. Contact ${email} if you need help.`
            : 'An application already exists for this email address.',
        },
        { status: 409 }
      );
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api-apply-duplicate-copy.test.ts tests/api-apply.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/apply/route.ts tests/api-apply-duplicate-copy.test.ts
git commit -m "fix(apply): configurable support address in the duplicate-email error"
```

---

### Task 6: The client surfaces — SideNav, CertificationUpload, CommunityApp

**Files:**
- Modify: `app/layout.tsx` (read the address, pass to `Chrome`)
- Modify: `components/Chrome.tsx:19-23,60` (accept + forward `supportEmail`)
- Modify: `components/SideNav.tsx:11,76,91` (accept `supportEmail`, conditional `HelpBlock`)
- Modify: `app/upload-certification/page.tsx` (pass the address)
- Modify: `components/CertificationUpload.tsx:59` (accept + conditionally render)
- Modify: `app/community/page.tsx` (pass the group URL, force dynamic)
- Modify: `components/CommunityApp.tsx:14-17,68` (accept `fbGroupUrl`, hide the link when null)

**Interfaces:**
- Consumes: `supportEmail()`, `fbGroupUrl()` from Task 1.
- Produces:
  - `Chrome` props gain `supportEmail: string | null`
  - `SideNav` props gain `supportEmail: string | null`
  - `CertificationUpload` props gain `supportEmail: string | null`
  - `CommunityApp` props gain `fbGroupUrl: string | null`

**Why props, not `NEXT_PUBLIC_*`:** `NEXT_PUBLIC_*` values are inlined at **build time**. On Workers, a support address set as a secret after deploy would never reach a client component. Reading it in the server page and passing it down reads the real runtime env on every request. `app/community/page.tsx` must therefore also set `export const dynamic = 'force-dynamic'` so it is not statically rendered with a stale value baked in.

There is no component-test infrastructure in this repo (no testing-library, no jsdom) and **this branch does not add any**. These changes are verified by the type checker, by `npm run build`, and by the browser pass in Task 8.

- [ ] **Step 1: Update `SideNav`**

In `components/SideNav.tsx`, change `HelpBlock` to take the address and return `null` without one:

```tsx
function HelpBlock({ supportEmail }: { supportEmail: string | null }) {
  if (!supportEmail) return null;
  return (
    <div className="mt-auto px-3 pb-7 pt-8">
      <div className="mx-3 border-t border-white/12 pt-6">
        <p className="text-[13px] text-white/45">Need help?</p>
        <a
          href={`mailto:${supportEmail}`}
          className="mt-2 flex items-center gap-2.5 text-[14px] text-white/75 transition-colors hover:text-white"
        >
          <LifeBuoy className="h-[17px] w-[17px] text-terracotta-mid" strokeWidth={1.6} />
          Contact our team
        </a>
      </div>
    </div>
  );
}
```

Change the default export's signature to `export default function SideNav({ items, supportEmail }: { items: SideNavItem[]; supportEmail: string | null })` and pass `supportEmail` into every `<HelpBlock />` usage (there are two — the desktop sidebar and the mobile drawer; check both).

- [ ] **Step 2: Thread it through `Chrome` and `layout`**

In `components/Chrome.tsx`, add `supportEmail: string | null` to the props interface, accept it in the destructured parameters, and pass it: `<SideNav items={navItems} supportEmail={supportEmail} />`.

In `app/layout.tsx`, import `supportEmail` and pass it:

```tsx
import { supportEmail } from '@/lib/support';
```

```tsx
        <Chrome signedIn={signedIn} navItems={navItems} supportEmail={supportEmail()}>
```

- [ ] **Step 3: Update the certification upload surface**

In `components/CertificationUpload.tsx`, add `supportEmail: string | null` to its props, and replace line 59:

```tsx
        <p className="mt-3 text-sm text-ink2/60">If you need a new link, contact utkarshrawatofficial@gmail.com.</p>
```

with:

```tsx
        {supportEmail && (
          <p className="mt-3 text-sm text-ink2/60">If you need a new link, contact {supportEmail}.</p>
        )}
```

In `app/upload-certification/page.tsx`, import `supportEmail` from `@/lib/support` and pass it:

```tsx
  return <CertificationUpload token={searchParams.token ?? ''} supportEmail={supportEmail()} />;
```

- [ ] **Step 4: Update the community Facebook link**

In `components/CommunityApp.tsx`, delete the placeholder constant at lines 14-17 entirely, add `fbGroupUrl: string | null` to the component's props, and wrap the link at line 68 so it renders only when the URL is known:

```tsx
      {fbGroupUrl && (
        <a href={fbGroupUrl} target="_blank" rel="noopener noreferrer" className="mt-6 flex items-center justify-between border border-forest bg-cream p-5 hover:border-terracotta">
          {/* keep the existing children of this anchor exactly as they are */}
        </a>
      )}
```

Replace `app/community/page.tsx` with:

```tsx
import CommunityApp from '@/components/CommunityApp';
import { fbGroupUrl } from '@/lib/support';

export const metadata = { title: 'Community | Wild Nutrition Practitioner Community' };
export const dynamic = 'force-dynamic';

export default function Page() {
  return <CommunityApp fbGroupUrl={fbGroupUrl()} />;
}
```

- [ ] **Step 5: Typecheck, test, and commit**

Run: `npx tsc --noEmit`
Expected: no errors. A missing prop at any call site is exactly what this catches.

Run: `npm test`
Expected: all green.

```bash
git add app/layout.tsx components/Chrome.tsx components/SideNav.tsx app/upload-certification/page.tsx components/CertificationUpload.tsx app/community/page.tsx components/CommunityApp.tsx
git commit -m "fix(ui): contact details and the group link come from config"
```

---

### Task 7: Readiness catches "present but wrong"

**Files:**
- Modify: `lib/readiness.ts` (add three checks and two warnings)
- Test: `tests/readiness-placeholders.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks — `lib/readiness.ts` reads `process.env` directly, matching its existing style.
- Produces: `readinessReport(bindings?)` keeps its signature and `ReadinessReport` shape. Three new check keys: `support_email` (required), `fb_group` (optional), `d1_id` (required). Two new warning strings.

The gap this closes: today `readinessReport` only detects **absent** config. `PORTAL_URL=http://localhost:3100` and `database_id = "PLACEHOLDER_D1_ID"` are both *present* and both wrong, and neither is currently reported.

- [ ] **Step 1: Write the failing test**

```ts
// tests/readiness-placeholders.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const KEYS = ['SUPPORT_EMAIL', 'NEXT_PUBLIC_FB_GROUP_URL', 'PORTAL_URL', 'CLOUDFLARE_D1_ID'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

const bindings = { hasD1: true, hasR2: true };

describe('readiness — support address', () => {
  it('reports support_email as missing and required when unset', async () => {
    const { readinessReport } = await import('@/lib/readiness');
    const check = readinessReport(bindings).checks.find((c) => c.key === 'support_email');
    expect(check).toBeDefined();
    expect(check!.status).toBe('missing');
    expect(check!.required).toBe(true);
  });

  it('blocks ready when the support address is unset', async () => {
    const { readinessReport } = await import('@/lib/readiness');
    expect(readinessReport(bindings).missingRequired).toContain('support_email');
  });

  it('goes live once set', async () => {
    process.env.SUPPORT_EMAIL = 'practitioners@example.org';
    const { readinessReport } = await import('@/lib/readiness');
    const check = readinessReport(bindings).checks.find((c) => c.key === 'support_email');
    expect(check!.status).toBe('live');
  });

  it('never leaks the configured address into the report', async () => {
    process.env.SUPPORT_EMAIL = 'practitioners@example.org';
    const { readinessReport } = await import('@/lib/readiness');
    expect(JSON.stringify(readinessReport(bindings))).not.toContain('practitioners@example.org');
  });
});

describe('readiness — localhost PORTAL_URL', () => {
  it('warns when PORTAL_URL still points at localhost', async () => {
    process.env.PORTAL_URL = 'http://localhost:3100';
    const { readinessReport } = await import('@/lib/readiness');
    const report = readinessReport(bindings);
    expect(report.warnings.some((w) => w.includes('localhost'))).toBe(true);
    expect(report.checks.find((c) => c.key === 'portal_url')!.status).not.toBe('live');
  });

  it('is clean for a real URL', async () => {
    process.env.PORTAL_URL = 'https://portal.example.org';
    const { readinessReport } = await import('@/lib/readiness');
    const report = readinessReport(bindings);
    expect(report.warnings.some((w) => w.includes('localhost'))).toBe(false);
    expect(report.checks.find((c) => c.key === 'portal_url')!.status).toBe('live');
  });
});

describe('readiness — facebook group', () => {
  it('reports fb_group as missing but NOT required', async () => {
    const { readinessReport } = await import('@/lib/readiness');
    const check = readinessReport(bindings).checks.find((c) => c.key === 'fb_group');
    expect(check!.status).toBe('missing');
    expect(check!.required).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/readiness-placeholders.test.ts`
Expected: FAIL — `support_email` and `fb_group` checks do not exist; no localhost warning.

- [ ] **Step 3: Write minimal implementation**

In `lib/readiness.ts`, add near the other derived booleans at the top of `readinessReport`:

```ts
  const portalUrl = (process.env.PORTAL_URL ?? '').trim();
  const portalIsLocal = /localhost|127\.0\.0\.1/i.test(portalUrl);
```

Replace the existing `portal_url` check so a localhost value is no longer reported as `live`:

```ts
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
```

Add these three checks to the `checks` array (anywhere after `admin_password` reads naturally):

```ts
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
```

Add the localhost warning next to the existing warnings:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/readiness-placeholders.test.ts tests/api-admin-readiness.test.ts`
Expected: PASS. `tests/api-admin-readiness.test.ts` may need updating if it asserts `ready: true` under an env that now lacks `SUPPORT_EMAIL` — set the variable inside that test rather than dropping the new requirement.

- [ ] **Step 5: Commit**

```bash
git add lib/readiness.ts tests/readiness-placeholders.test.ts
git commit -m "feat(readiness): catch present-but-wrong config, not just missing config"
```

---

### Task 8: Documentation, full gates, and the launch-day rehearsal

**Files:**
- Modify: `.env.example` (add `SUPPORT_EMAIL`, `NEXT_PUBLIC_FB_GROUP_URL`, `CLOUDFLARE_D1_ID`)
- Modify: `docs/CLOUDFLARE_GO_LIVE.md` (secrets table + a pre-flight section)
- Modify: `HANDOVER.md` (note `lib/support.ts` as the contact source of truth)

**Interfaces:**
- Consumes: everything above.
- Produces: no code exports. This task's deliverable is a launch-ready doc set plus proof the branch passes all three gates.

- [ ] **Step 1: Add the new variables to `.env.example`**

```bash
# Contact details shown to practitioners. UNSET = the contact line is omitted
# everywhere rather than showing a wrong address. Never hardcode a personal one.
SUPPORT_EMAIL=
# Optional: where missed-chat alerts go. Falls back to SUPPORT_EMAIL.
ADMIN_ALERT_EMAIL=
# The private Facebook group. Unset = the link is hidden on /community.
NEXT_PUBLIC_FB_GROUP_URL=
# Set to the same value as database_id in wrangler.toml, so
# /api/admin/readiness can confirm PLACEHOLDER_D1_ID was replaced.
CLOUDFLARE_D1_ID=
```

- [ ] **Step 2: Update the go-live doc**

Add `SUPPORT_EMAIL`, `NEXT_PUBLIC_FB_GROUP_URL` and `CLOUDFLARE_D1_ID` to the secrets table in §3, then add this section after §5b:

```markdown
## 5c. Pre-flight — the checks that fail silently

`/api/admin/readiness` must show `ready: true` **and an empty `warnings` array**.
`ready: true` alone is not sufficient; warnings cover the settings that are present
but wrong, which no amount of clicking around will reveal:

- `PORTAL_URL` still on localhost — magic links, referral links and cron self-calls
  all break for real practitioners while looking fine to you
- `SUPPORT_EMAIL` unset — every contact line is silently omitted
- Shopify configured without `SHOPIFY_WEBHOOK_SECRET` — orders never reconcile, so
  sales and referral credit silently never register
- A leftover `TURSO_DATABASE_URL`

**Ask IT for the DNS records early.** Resend needs a *domain-verified* sender before
any email sends; that is a DNS change with a lead time, and it is the single most
likely cause of a delayed launch. Request it at the same time as the API key, not after.
```

- [ ] **Step 3: Run the full gates**

```bash
export PATH="/c/Users/UtkarshRawat/AppData/Local/node/node-v22.20.0-win-x64:$PATH"
npm test
```
Expected: all green, **around 460 tests** (437 baseline + ~23 added here).

Stop any dev server first, then:
```bash
npm run build
```
Expected: clean build. If it fails with `Cannot find module './<n>.js'`, a dev server was running: kill it, `rm -rf .next`, rebuild.

- [ ] **Step 4: Rehearse the keyed path in real workerd**

```bash
npm run preview:cf
```

Then, with the worker running on `:8787`:
1. Sign in at `/admin` with `preview-admin` and open `/api/admin/readiness`. Confirm `support_email` reports `missing` and `ready` is `false` — the check works.
2. Stop the worker. Add `SUPPORT_EMAIL=practitioners@example.org` and `PORTAL_URL=https://portal.example.org` to `.dev.vars`. Restart.
3. Re-open `/api/admin/readiness`. Confirm `support_email` is now `live`, the localhost warning is gone, and **the address itself does not appear anywhere in the response**.
4. Open `/community` and confirm the Facebook link is absent while `NEXT_PUBLIC_FB_GROUP_URL` is unset.
5. Open any signed-in page and confirm the sidebar's "Need help?" block is absent without a support address, and present with one.

This is the rehearsal that matters: it proves the config lights up in real workerd, which is the same mechanism launch day depends on.

- [ ] **Step 5: Commit and report**

```bash
git add .env.example docs/CLOUDFLARE_GO_LIVE.md HANDOVER.md
git commit -m "docs(go-live): pre-flight checks and the new contact configuration"
```

Report the final test count, the build result, and what the `preview:cf` rehearsal showed — including anything that did **not** behave as this plan predicted.

---

## Self-Review

**Spec coverage:** All 8 gmail sites are covered — templates ×2 (Task 2), smtp reply-to (Task 2), chat alerts (Task 3), registers UA (Task 4), thumbnail UA (Task 4), apply 409 (Task 5), CertificationUpload (Task 6), SideNav (Task 6). The Facebook placeholder is Task 6. Readiness extensions are Task 7. Docs and gates are Task 8.

**Placeholder scan:** No TBDs. Every code step carries real code. The only intentionally unknown values are the support address and group URL themselves, which is the point of the design — they are configuration, and the code is correct with them unset.

**Type consistency:** `supportEmail()`, `fbGroupUrl()`, `outboundUserAgent()` are defined in Task 1 and used with those exact names in Tasks 2-6. `alertRecipient()` changes from `string` to `string | null` in Task 3 and its only caller is updated in the same task. Prop names `supportEmail` and `fbGroupUrl` are consistent across `Chrome`, `SideNav`, `CertificationUpload` and `CommunityApp`.

**Known follow-up, deliberately out of scope:** the 12 `knowledge/` dossiers are still `AWAITING APPROVAL`. That is clinical sign-off, not code, and it gates using the AI assistant with real practitioners. It is the longest-lead launch item and should be started in parallel with this branch.
