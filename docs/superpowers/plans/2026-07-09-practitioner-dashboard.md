# Practitioner Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Self-serve practitioner dashboard: magic-link login → referral code/link with copy, live stats (clicks, orders, conversion, commission), tier placeholder, profile — in the existing practitioner-portal app.

**Architecture:** Magic-link tokens and click records live in the existing SQLite db. An HMAC-signed cookie carries the session. `/r/[code]` records clicks then redirects to the Shopify discount URL. A `StatsProvider` (Shopify Admin API or mock) feeds `computeStats()` with a 60s cache and stale-fallback; the client polls every 60s.

**Tech Stack:** Existing app — Next.js 14, TypeScript, better-sqlite3, zod, Vitest, Tailwind (brand tokens already configured).

**Spec:** `docs/superpowers/specs/2026-07-09-practitioner-dashboard-design.md`

## Global Constraints

- Branding: ONLY existing Tailwind tokens (`ink ink2 terracotta cream sage stone forest`, `font-heading`, `font-body`) — must look identical to wildnutrition.com/pages/practitioner-community. No new colours/fonts.
- Referral link format: `{PORTAL_URL}/r/{CODE}` (PORTAL_URL default `http://localhost:3100`). Shopify destination: `https://www.wildnutrition.com/discount/{CODE}?utm_source=practitioner&utm_medium=referral&utm_campaign={CODE}`.
- Magic tokens: 32 random bytes hex, 15-min expiry, single-use. Session cookie `wn_session` = `{id}.{expiryMs}.{hmac-sha256}`, 30 days, HttpOnly, SameSite=Lax. HMAC key `SESSION_SECRET` (dev default `dev-secret-change-me`).
- `POST /api/auth/request-link` always returns 200 (no email enumeration); only `approved` practitioners get tokens; `devLink` returned only when the sender is the mock.
- Commission: `COMMISSION_PERCENT` env, default `20`, applied at computation time.
- `/r/[code]` never errors: unknown code or DB failure → 302 to `https://www.wildnutrition.com/`.
- Stats endpoint never 500s on provider failure: serve cached with `stale: true`, else zeros with `stale: true`.
- New env vars documented in `.env.example`: `SESSION_SECRET`, `PORTAL_URL`, `COMMISSION_PERCENT`.

---

### Task 1: DB additions + portal referral link

**Files:**
- Modify: `lib/db.ts` (SCHEMA constant + new functions at end of file)
- Modify: `lib/codes.ts` (referralLink → portal URL; add shopifyDiscountUrl, portalUrl)
- Modify: `tests/codes.test.ts` (referralLink expectation)
- Test: `tests/dashboard-db.test.ts`

**Interfaces:**
- Consumes: existing `getDb()`, `Practitioner`, `rowToPractitioner` pattern in `lib/db.ts`.
- Produces:
```ts
// lib/db.ts
createAuthToken(practitionerId: number): string        // 64-char hex
consumeAuthToken(token: string): number | null          // practitionerId; marks used
findByCode(code: string): Practitioner | null
recordClick(practitionerId: number, code: string): void
clickStats(practitionerId: number): { clicksThisMonth: number; clicksAllTime: number }
// lib/codes.ts
portalUrl(): string                                      // PORTAL_URL default http://localhost:3100
referralLink(code: string): string                       // `${portalUrl()}/r/${code}`
shopifyDiscountUrl(code: string): string                 // wildnutrition.com/discount/… + UTMs
```

- [ ] **Step 1: Write the failing test**

`tests/dashboard-db.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-dash-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved() {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = insertApplication({
    name: 'Jane Smith', email: 'jane@example.com', registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus: 'qualified',
  });
  return markApproved(p.id, {
    affiliateCode: 'WN-SMITH-AB2C',
    affiliateLink: 'http://localhost:3100/r/WN-SMITH-AB2C',
    pendingSync: false, decidedBy: 'system',
  });
}

describe('auth tokens', () => {
  it('creates a 64-char hex token and consumes it exactly once', async () => {
    const { createAuthToken, consumeAuthToken } = await import('@/lib/db');
    const p = await seedApproved();
    const token = createAuthToken(p.id);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(consumeAuthToken(token)).toBe(p.id);
    expect(consumeAuthToken(token)).toBeNull(); // single-use
  });

  it('rejects unknown and expired tokens', async () => {
    const { createAuthToken, consumeAuthToken, getDb } = await import('@/lib/db');
    const p = await seedApproved();
    expect(consumeAuthToken('deadbeef'.repeat(8))).toBeNull();
    const token = createAuthToken(p.id);
    getDb().prepare(`UPDATE auth_tokens SET expires_at = datetime('now', '-1 minute') WHERE token = ?`).run(token);
    expect(consumeAuthToken(token)).toBeNull();
  });
});

describe('clicks', () => {
  it('finds practitioner by code and counts clicks by month and all-time', async () => {
    const { findByCode, recordClick, clickStats, getDb } = await import('@/lib/db');
    const p = await seedApproved();
    expect(findByCode('WN-SMITH-AB2C')?.id).toBe(p.id);
    expect(findByCode('WN-NOPE-XXXX')).toBeNull();
    recordClick(p.id, 'WN-SMITH-AB2C');
    recordClick(p.id, 'WN-SMITH-AB2C');
    // one click from a previous month
    getDb().prepare(
      `INSERT INTO clicks (practitioner_id, code, created_at) VALUES (?, ?, datetime('now', '-40 days'))`
    ).run(p.id, 'WN-SMITH-AB2C');
    expect(clickStats(p.id)).toEqual({ clicksThisMonth: 2, clicksAllTime: 3 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dashboard-db.test.ts`
Expected: FAIL — `createAuthToken` is not exported.

- [ ] **Step 3: Implement**

In `lib/db.ts`, append to the `SCHEMA` string (before the closing backtick):
```sql
CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Add `import { randomBytes } from 'crypto';` at the top and these functions at the end:
```ts
export function createAuthToken(practitionerId: number): string {
  const token = randomBytes(32).toString('hex');
  getDb()
    .prepare(
      `INSERT INTO auth_tokens (token, practitioner_id, expires_at)
       VALUES (?, ?, datetime('now', '+15 minutes'))`
    )
    .run(token, practitionerId);
  return token;
}

export function consumeAuthToken(token: string): number | null {
  const row = getDb()
    .prepare(
      `SELECT practitioner_id FROM auth_tokens
       WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')`
    )
    .get(token) as { practitioner_id: number } | undefined;
  if (!row) return null;
  getDb().prepare(`UPDATE auth_tokens SET used_at = datetime('now') WHERE token = ?`).run(token);
  return row.practitioner_id;
}

export function findByCode(code: string): Practitioner | null {
  const row = getDb().prepare(`SELECT * FROM practitioners WHERE affiliate_code = ?`).get(code);
  return row ? rowToPractitioner(row) : null;
}

export function recordClick(practitionerId: number, code: string): void {
  getDb().prepare(`INSERT INTO clicks (practitioner_id, code) VALUES (?, ?)`).run(practitionerId, code);
}

export function clickStats(practitionerId: number): {
  clicksThisMonth: number;
  clicksAllTime: number;
} {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS all_time,
         SUM(CASE WHEN strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now') THEN 1 ELSE 0 END) AS this_month
       FROM clicks WHERE practitioner_id = ?`
    )
    .get(practitionerId) as { all_time: number; this_month: number | null };
  return { clicksThisMonth: row.this_month ?? 0, clicksAllTime: row.all_time };
}
```

Replace the whole of `lib/codes.ts`'s `referralLink` with:
```ts
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
```

In `tests/codes.test.ts`, replace the `referralLink` describe block with:
```ts
describe('referralLink', () => {
  it('builds a portal redirect URL from PORTAL_URL', () => {
    process.env.PORTAL_URL = 'https://portal.example.com';
    expect(referralLink('WN-SMITH-AB2C')).toBe('https://portal.example.com/r/WN-SMITH-AB2C');
    delete process.env.PORTAL_URL;
    expect(referralLink('WN-SMITH-AB2C')).toBe('http://localhost:3100/r/WN-SMITH-AB2C');
  });

  it('builds the Shopify discount destination with UTM params', () => {
    expect(shopifyDiscountUrl('WN-SMITH-AB2C')).toBe(
      'https://www.wildnutrition.com/discount/WN-SMITH-AB2C?utm_source=practitioner&utm_medium=referral&utm_campaign=WN-SMITH-AB2C'
    );
  });
});
```
(also add `shopifyDiscountUrl` to the import.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/dashboard-db.test.ts tests/codes.test.ts tests/pipeline.test.ts`
Expected: PASS (pipeline still passes — it only asserts the link contains the code).

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/codes.ts tests/dashboard-db.test.ts tests/codes.test.ts
git commit -m "feat: auth tokens, click tracking tables, portal-routed referral links"
```

---

### Task 2: Session auth + magic links

**Files:**
- Create: `lib/practitionerAuth.ts`, `lib/magicLink.ts`
- Test: `tests/practitioner-auth.test.ts`

**Interfaces:**
- Consumes: `createAuthToken`, `findByEmail`, `getPractitioner`, `Practitioner` (lib/db); `portalUrl` (lib/codes).
- Produces:
```ts
// lib/practitionerAuth.ts
createSessionValue(practitionerId: number, expiresAtMs?: number): string
verifySessionValue(value: string): number | null
sessionCookieHeader(practitionerId: number): string      // Set-Cookie value
clearSessionCookieHeader(): string
getSessionPractitioner(req: Request): Practitioner | null
// lib/magicLink.ts
interface MagicLinkSender { name: string; send(input: { email: string; url: string }): Promise<void>; }
getMagicLinkSender(): MagicLinkSender                     // mock until transactional email creds exist
requestLoginLink(email: string): Promise<{ devLink: string | null }>
```

- [ ] **Step 1: Write the failing test**

`tests/practitioner-auth.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  createSessionValue, verifySessionValue, sessionCookieHeader, getSessionPractitioner,
} from '@/lib/practitionerAuth';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-auth-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seed(status: 'approved' | 'flagged') {
  const { insertApplication, markApproved, flagPractitioner } = await import('@/lib/db');
  const p = insertApplication({
    name: 'Jane Smith', email: 'jane@example.com', registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus: 'qualified',
  });
  if (status === 'approved') {
    return markApproved(p.id, {
      affiliateCode: 'WN-SMITH-AB2C', affiliateLink: 'http://localhost:3100/r/WN-SMITH-AB2C',
      pendingSync: false, decidedBy: 'system',
    });
  }
  return flagPractitioner(p.id, {
    reasonCode: 'NO_MATCH', confidence: 'none', detail: 'x', manualSearchUrl: 'https://example.com',
  });
}

describe('session values', () => {
  it('round-trips a valid session', () => {
    const v = createSessionValue(42);
    expect(verifySessionValue(v)).toBe(42);
  });

  it('rejects tampered ids and signatures', () => {
    const v = createSessionValue(42);
    const [, exp, mac] = v.split('.');
    expect(verifySessionValue(`43.${exp}.${mac}`)).toBeNull();
    expect(verifySessionValue(`42.${exp}.${'0'.repeat(64)}`)).toBeNull();
    expect(verifySessionValue('garbage')).toBeNull();
  });

  it('rejects expired sessions', () => {
    const v = createSessionValue(42, Date.now() - 1000);
    expect(verifySessionValue(v)).toBeNull();
  });
});

describe('getSessionPractitioner', () => {
  it('resolves the practitioner from the cookie', async () => {
    const p = await seed('approved');
    const req = new Request('http://x/', {
      headers: { cookie: sessionCookieHeader(p.id).split(';')[0] },
    });
    expect(getSessionPractitioner(req)?.email).toBe('jane@example.com');
    expect(getSessionPractitioner(new Request('http://x/'))).toBeNull();
  });
});

describe('requestLoginLink', () => {
  it('returns a consumable devLink for approved practitioners (mock sender)', async () => {
    const p = await seed('approved');
    const { requestLoginLink } = await import('@/lib/magicLink');
    const { devLink } = await requestLoginLink('jane@example.com');
    expect(devLink).toContain('/api/auth/verify?token=');
    const token = devLink!.split('token=')[1];
    const { consumeAuthToken } = await import('@/lib/db');
    expect(consumeAuthToken(token)).toBe(p.id);
  });

  it('returns null devLink for unknown or non-approved emails', async () => {
    await seed('flagged');
    const { requestLoginLink } = await import('@/lib/magicLink');
    expect((await requestLoginLink('jane@example.com')).devLink).toBeNull();
    expect((await requestLoginLink('nobody@example.com')).devLink).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/practitioner-auth.test.ts`
Expected: FAIL — cannot resolve `@/lib/practitionerAuth`.

- [ ] **Step 3: Implement**

`lib/practitionerAuth.ts`:
```ts
import { createHmac, timingSafeEqual } from 'crypto';
import { getPractitioner, type Practitioner } from '@/lib/db';

const COOKIE = 'wn_session';
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

function secret(): string {
  return process.env.SESSION_SECRET || 'dev-secret-change-me';
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

export function createSessionValue(
  practitionerId: number,
  expiresAtMs: number = Date.now() + THIRTY_DAYS_S * 1000
): string {
  const payload = `${practitionerId}.${expiresAtMs}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionValue(value: string): number | null {
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [idStr, expStr, mac] = parts;
  const expected = sign(`${idStr}.${expStr}`);
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  } catch {
    return null;
  }
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const id = Number(idStr);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function sessionCookieHeader(practitionerId: number): string {
  return `${COOKIE}=${createSessionValue(practitionerId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${THIRTY_DAYS_S}`;
}

export function clearSessionCookieHeader(): string {
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export function getSessionPractitioner(req: Request): Practitioner | null {
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)wn_session=([^;]+)/);
  if (!match) return null;
  const id = verifySessionValue(match[1]);
  return id ? getPractitioner(id) : null;
}
```

`lib/magicLink.ts`:
```ts
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
  const practitioner = findByEmail(email);
  if (!practitioner || practitioner.status !== 'approved') return { devLink: null };
  const token = createAuthToken(practitioner.id);
  const url = `${portalUrl()}/api/auth/verify?token=${token}`;
  const sender = getMagicLinkSender();
  await sender.send({ email: practitioner.email, url });
  return { devLink: sender.name === 'mock' ? url : null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/practitioner-auth.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/practitionerAuth.ts lib/magicLink.ts tests/practitioner-auth.test.ts
git commit -m "feat: HMAC session cookies and magic-link login flow"
```

---

### Task 3: Stats service

**Files:**
- Create: `lib/stats.ts`
- Test: `tests/stats.test.ts`

**Interfaces:**
- Consumes: `clickStats` (lib/db), `Practitioner` (lib/db).
- Produces:
```ts
interface OrderStats { ordersThisMonth: number; ordersAllTime: number; revenueThisMonth: number; revenueAllTime: number; }
interface StatsProvider { name: string; getOrderStats(code: string): Promise<OrderStats>; }  // throws on failure
interface DashboardStats extends OrderStats {
  clicksThisMonth: number; clicksAllTime: number;
  commissionThisMonth: number; commissionAllTime: number;
  conversionRate: number;      // percent, 1 decimal, 0 when no clicks
  stale: boolean;
}
getStatsProvider(): StatsProvider                      // shopify if env creds, else mock (zeros)
computeStats(p: Practitioner, provider?: StatsProvider): Promise<DashboardStats>  // 60s cache per code
clearStatsCacheForTests(): void
```

- [ ] **Step 1: Write the failing test**

`tests/stats.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-stats-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  delete process.env.COMMISSION_PERCENT;
  delete process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_ADMIN_TOKEN;
  (await import('@/lib/stats')).clearStatsCacheForTests();
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function seedApproved() {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = insertApplication({
    name: 'Jane Smith', email: 'jane@example.com', registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus: 'qualified',
  });
  return markApproved(p.id, {
    affiliateCode: 'WN-SMITH-AB2C', affiliateLink: 'http://localhost:3100/r/WN-SMITH-AB2C',
    pendingSync: false, decidedBy: 'system',
  });
}

const richProvider = {
  name: 'fake',
  async getOrderStats() {
    return { ordersThisMonth: 2, ordersAllTime: 10, revenueThisMonth: 150, revenueAllTime: 1000 };
  },
};

describe('computeStats', () => {
  it('combines clicks, orders, commission (default 20%) and conversion rate', async () => {
    const p = await seedApproved();
    const { recordClick } = await import('@/lib/db');
    for (let i = 0; i < 5; i++) recordClick(p.id, p.affiliateCode!);
    const { computeStats } = await import('@/lib/stats');
    const s = await computeStats(p, richProvider);
    expect(s.clicksThisMonth).toBe(5);
    expect(s.clicksAllTime).toBe(5);
    expect(s.commissionThisMonth).toBe(30);   // 150 * 20%
    expect(s.commissionAllTime).toBe(200);    // 1000 * 20%
    expect(s.conversionRate).toBe(200);       // 10 orders / 5 clicks = 200.0%
    expect(s.stale).toBe(false);
  });

  it('respects COMMISSION_PERCENT and zero-click conversion', async () => {
    process.env.COMMISSION_PERCENT = '15';
    const p = await seedApproved();
    const { computeStats } = await import('@/lib/stats');
    const s = await computeStats(p, richProvider);
    expect(s.commissionAllTime).toBe(150);
    expect(s.conversionRate).toBe(0); // no clicks — no division by zero
  });

  it('mock provider yields all-zero stats, not stale', async () => {
    const p = await seedApproved();
    const { computeStats, getStatsProvider } = await import('@/lib/stats');
    expect(getStatsProvider().name).toBe('mock');
    const s = await computeStats(p);
    expect(s.ordersAllTime).toBe(0);
    expect(s.commissionAllTime).toBe(0);
    expect(s.stale).toBe(false);
  });

  it('caches per code for 60s (provider called once)', async () => {
    const p = await seedApproved();
    const spy = vi.fn(richProvider.getOrderStats);
    const { computeStats } = await import('@/lib/stats');
    await computeStats(p, { name: 'fake', getOrderStats: spy });
    await computeStats(p, { name: 'fake', getOrderStats: spy });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('serves cached data with stale=true when the provider starts failing', async () => {
    const p = await seedApproved();
    const { computeStats, clearStatsCacheForTests } = await import('@/lib/stats');
    await computeStats(p, richProvider);
    // cache is fresh, so force a re-fetch path by clearing timestamps via a new code path:
    clearStatsCacheForTests();
    const good = await computeStats(p, richProvider);
    expect(good.stale).toBe(false);
    // simulate expiry then failure
    clearStatsCacheForTests();
    const failing = { name: 'fake', async getOrderStats(): Promise<any> { throw new Error('api down'); } };
    const s = await computeStats(p, failing);
    expect(s.stale).toBe(true);
    expect(s.ordersAllTime).toBe(0); // no cache after clear → zeros
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stats.test.ts`
Expected: FAIL — cannot resolve `@/lib/stats`.

- [ ] **Step 3: Implement**

`lib/stats.ts`:
```ts
import { clickStats, type Practitioner } from '@/lib/db';

export interface OrderStats {
  ordersThisMonth: number;
  ordersAllTime: number;
  revenueThisMonth: number;
  revenueAllTime: number;
}

export interface StatsProvider {
  name: string;
  /** Throws on API failure — computeStats handles degradation. */
  getOrderStats(code: string): Promise<OrderStats>;
}

export interface DashboardStats extends OrderStats {
  clicksThisMonth: number;
  clicksAllTime: number;
  commissionThisMonth: number;
  commissionAllTime: number;
  conversionRate: number;
  stale: boolean;
}

const ZERO_ORDERS: OrderStats = {
  ordersThisMonth: 0, ordersAllTime: 0, revenueThisMonth: 0, revenueAllTime: 0,
};

const mockStats: StatsProvider = {
  name: 'mock',
  async getOrderStats() {
    return { ...ZERO_ORDERS };
  },
};

/** Sums orders carrying the discount code via the Shopify Admin GraphQL API. */
const shopifyStats: StatsProvider = {
  name: 'shopify',
  async getOrderStats(code: string): Promise<OrderStats> {
    const domain = process.env.SHOPIFY_STORE_DOMAIN!;
    const token = process.env.SHOPIFY_ADMIN_TOKEN!;
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const result = { ...ZERO_ORDERS };
    let after: string | null = null;
    do {
      const res: Response = await fetch(`https://${domain}/admin/api/2024-07/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({
          query: `query($q: String!, $after: String) {
            orders(first: 250, query: $q, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes { createdAt currentTotalPriceSet { shopMoney { amount } } }
            }
          }`,
          variables: { q: `discount_code:${code}`, after },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Shopify orders query failed (${res.status})`);
      const body = await res.json();
      if (body.errors) throw new Error(`Shopify orders query errors: ${JSON.stringify(body.errors)}`);
      const conn = body.data.orders;
      for (const node of conn.nodes) {
        const amount = Number(node.currentTotalPriceSet.shopMoney.amount);
        result.ordersAllTime += 1;
        result.revenueAllTime += amount;
        if (String(node.createdAt).startsWith(monthPrefix)) {
          result.ordersThisMonth += 1;
          result.revenueThisMonth += amount;
        }
      }
      after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    } while (after);
    return result;
  },
};

export function getStatsProvider(): StatsProvider {
  if (process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_TOKEN) return shopifyStats;
  return mockStats;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; data: DashboardStats }>();

export function clearStatsCacheForTests(): void {
  cache.clear();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function computeStats(
  practitioner: Practitioner,
  provider: StatsProvider = getStatsProvider()
): Promise<DashboardStats> {
  const code = practitioner.affiliateCode ?? '';
  const cached = cache.get(code);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const clicks = clickStats(practitioner.id);
  let orders: OrderStats;
  let stale = false;
  try {
    orders = await provider.getOrderStats(code);
  } catch {
    if (cached) return { ...cached.data, ...clicks, stale: true };
    orders = { ...ZERO_ORDERS };
    stale = true;
  }

  const percent = Number(process.env.COMMISSION_PERCENT || '20');
  const data: DashboardStats = {
    ...clicks,
    ...orders,
    commissionThisMonth: round2((orders.revenueThisMonth * percent) / 100),
    commissionAllTime: round2((orders.revenueAllTime * percent) / 100),
    conversionRate:
      clicks.clicksAllTime > 0
        ? Math.round((orders.ordersAllTime / clicks.clicksAllTime) * 1000) / 10
        : 0,
    stale,
  };
  if (!stale) cache.set(code, { at: Date.now(), data });
  return data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stats.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/stats.ts tests/stats.test.ts
git commit -m "feat: stats service with Shopify/mock provider, cache and stale fallback"
```

---

### Task 4: Routes — redirect, auth endpoints, /api/me

**Files:**
- Create: `app/r/[code]/route.ts`, `app/api/auth/request-link/route.ts`, `app/api/auth/verify/route.ts`, `app/api/auth/logout/route.ts`, `app/api/me/route.ts`, `app/api/me/stats/route.ts`
- Test: `tests/api-dashboard.test.ts`

**Interfaces:**
- Consumes: `findByCode/recordClick/consumeAuthToken` (Task 1 db), `shopifyDiscountUrl/portalUrl/referralLink` (Task 1 codes), `sessionCookieHeader/clearSessionCookieHeader/getSessionPractitioner` (Task 2), `requestLoginLink` (Task 2), `computeStats` (Task 3).
- Produces:
  - `GET /r/:code` → 302 discount URL (click recorded) | 302 wildnutrition.com homepage.
  - `POST /api/auth/request-link {email}` → 200 `{ ok: true, devLink: string|null }` always.
  - `GET /api/auth/verify?token=` → 302 `/dashboard` + Set-Cookie | 302 `/dashboard?error=expired`.
  - `POST /api/auth/logout` → 204 + clearing Set-Cookie.
  - `GET /api/me` → 200 `{ practitioner: { name,email,registerBody,registerNumber,qualificationStatus,tier,createdAt }, code, link }` | 401.
  - `GET /api/me/stats` → 200 `DashboardStats` JSON | 401.

- [ ] **Step 1: Write the failing test**

`tests/api-dashboard.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-dashapi-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  delete process.env.PORTAL_URL;
  (await import('@/lib/stats')).clearStatsCacheForTests();
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function seedApproved() {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = insertApplication({
    name: 'Jane Smith', email: 'jane@example.com', registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus: 'qualified',
  });
  return markApproved(p.id, {
    affiliateCode: 'WN-SMITH-AB2C', affiliateLink: 'http://localhost:3100/r/WN-SMITH-AB2C',
    pendingSync: false, decidedBy: 'system',
  });
}

async function sessionHeaders(id: number): Promise<Record<string, string>> {
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return { cookie: sessionCookieHeader(id).split(';')[0] };
}

describe('GET /r/[code]', () => {
  it('records the click and redirects to the Shopify discount URL', async () => {
    const p = await seedApproved();
    const { GET } = await import('@/app/r/[code]/route');
    const res = await GET(new Request('http://x/r/WN-SMITH-AB2C'), { params: { code: 'WN-SMITH-AB2C' } });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/discount/WN-SMITH-AB2C');
    const { clickStats } = await import('@/lib/db');
    expect(clickStats(p.id).clicksAllTime).toBe(1);
  });

  it('redirects unknown codes to the homepage', async () => {
    const { GET } = await import('@/app/r/[code]/route');
    const res = await GET(new Request('http://x/r/WN-NOPE-XXXX'), { params: { code: 'WN-NOPE-XXXX' } });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://www.wildnutrition.com/');
  });
});

describe('auth endpoints', () => {
  it('request-link always 200s; devLink only for approved practitioners', async () => {
    await seedApproved();
    const { POST } = await import('@/app/api/auth/request-link/route');
    const known = await POST(new Request('http://x/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jane@example.com' }),
    }));
    expect(known.status).toBe(200);
    expect((await known.json()).devLink).toContain('/api/auth/verify?token=');
    const unknown = await POST(new Request('http://x/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com' }),
    }));
    expect(unknown.status).toBe(200);
    expect((await unknown.json()).devLink).toBeNull();
  });

  it('verify sets a session cookie and redirects to /dashboard', async () => {
    const p = await seedApproved();
    const { createAuthToken } = await import('@/lib/db');
    const token = createAuthToken(p.id);
    const { GET } = await import('@/app/api/auth/verify/route');
    const res = await GET(new Request(`http://x/api/auth/verify?token=${token}`));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost:3100/dashboard');
    expect(res.headers.get('set-cookie')).toContain('wn_session=');
    const bad = await GET(new Request('http://x/api/auth/verify?token=nope'));
    expect(bad.headers.get('location')).toBe('http://localhost:3100/dashboard?error=expired');
  });
});

describe('/api/me and /api/me/stats', () => {
  it('401 without a session', async () => {
    const me = await import('@/app/api/me/route');
    expect((await me.GET(new Request('http://x/'))).status).toBe(401);
    const stats = await import('@/app/api/me/stats/route');
    expect((await stats.GET(new Request('http://x/'))).status).toBe(401);
  });

  it('returns profile, code, portal link and stats with a session', async () => {
    const p = await seedApproved();
    const headers = await sessionHeaders(p.id);
    const me = await import('@/app/api/me/route');
    const meRes = await me.GET(new Request('http://x/', { headers }));
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.practitioner.name).toBe('Jane Smith');
    expect(meBody.practitioner.tier).toBe('standard');
    expect(meBody.code).toBe('WN-SMITH-AB2C');
    expect(meBody.link).toBe('http://localhost:3100/r/WN-SMITH-AB2C');
    const stats = await import('@/app/api/me/stats/route');
    const sRes = await stats.GET(new Request('http://x/', { headers }));
    expect(sRes.status).toBe(200);
    const s = await sRes.json();
    expect(s.clicksAllTime).toBe(0);
    expect(s.stale).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api-dashboard.test.ts`
Expected: FAIL — cannot resolve `@/app/r/[code]/route`.

- [ ] **Step 3: Implement the six routes**

`app/r/[code]/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { findByCode, recordClick } from '@/lib/db';
import { shopifyDiscountUrl } from '@/lib/codes';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { code: string } }
): Promise<NextResponse> {
  const code = (params.code ?? '').toUpperCase();
  try {
    const practitioner = findByCode(code);
    if (practitioner) {
      try {
        recordClick(practitioner.id, code);
      } catch {
        // losing a click is acceptable; losing the customer is not
      }
      return NextResponse.redirect(shopifyDiscountUrl(code), 302);
    }
  } catch {
    // fall through to homepage
  }
  return NextResponse.redirect('https://www.wildnutrition.com/', 302);
}
```

`app/api/auth/request-link/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requestLoginLink } from '@/lib/magicLink';

export const dynamic = 'force-dynamic';

const schema = z.object({ email: z.string().trim().email() });

export async function POST(req: Request): Promise<NextResponse> {
  let email = '';
  try {
    const parsed = schema.safeParse(await req.json());
    if (parsed.success) email = parsed.data.email;
  } catch {
    /* treated as unknown email */
  }
  // Identical response shape regardless of whether the email exists.
  const { devLink } = email ? await requestLoginLink(email) : { devLink: null };
  return NextResponse.json({ ok: true, devLink });
}
```

`app/api/auth/verify/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { consumeAuthToken } from '@/lib/db';
import { portalUrl } from '@/lib/codes';
import { sessionCookieHeader } from '@/lib/practitionerAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const practitionerId = token ? consumeAuthToken(token) : null;
  if (!practitionerId) {
    return NextResponse.redirect(`${portalUrl()}/dashboard?error=expired`, 302);
  }
  const res = NextResponse.redirect(`${portalUrl()}/dashboard`, 302);
  res.headers.set('Set-Cookie', sessionCookieHeader(practitionerId));
  return res;
}
```

`app/api/auth/logout/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { clearSessionCookieHeader } from '@/lib/practitionerAuth';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set('Set-Cookie', clearSessionCookieHeader());
  return res;
}
```

`app/api/me/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { referralLink } from '@/lib/codes';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const p = getSessionPractitioner(req);
  if (!p || p.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  return NextResponse.json({
    practitioner: {
      name: p.name,
      email: p.email,
      registerBody: p.registerBody,
      registerNumber: p.registerNumber,
      qualificationStatus: p.qualificationStatus,
      tier: p.tier,
      createdAt: p.createdAt,
    },
    code: p.affiliateCode,
    link: p.affiliateCode ? referralLink(p.affiliateCode) : null,
  });
}
```

`app/api/me/stats/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { computeStats } from '@/lib/stats';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const p = getSessionPractitioner(req);
  if (!p || p.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  return NextResponse.json(await computeStats(p));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api-dashboard.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add app/r app/api/auth app/api/me tests/api-dashboard.test.ts
git commit -m "feat: click redirect, magic-link auth endpoints, session-gated me/stats APIs"
```

---

### Task 5: Dashboard UI + env docs + verification

**Files:**
- Create: `app/dashboard/page.tsx`, `components/DashboardApp.tsx`
- Modify: `.env.example` (new vars), `README.md` (dashboard section)

**Interfaces:**
- Consumes: `POST /api/auth/request-link`, `POST /api/auth/logout`, `GET /api/me`, `GET /api/me/stats` (Task 4 response shapes).

- [ ] **Step 1: Write the page and component**

`app/dashboard/page.tsx`:
```tsx
import DashboardApp from '@/components/DashboardApp';

export const metadata = { title: 'My Dashboard | Wild Nutrition Practitioner Community' };

export default function DashboardPage() {
  return <DashboardApp />;
}
```

`components/DashboardApp.tsx` — client component implementing: initial `/api/me` fetch (401 → login screen), magic-link request form with "check your email" + devLink display, stats grid with 60s polling via `setInterval`, skeleton loading blocks, empty state when `clicksAllTime === 0 && ordersAllTime === 0 && !stale`, "live stats temporarily unavailable" note when `stale`, copy-to-clipboard buttons with "Copied ✓" feedback, tier card with "Tiering criteria coming soon", read-only profile card, logout button. Brand tokens only; responsive `md:grid-cols-2`. (Full code in repository — ~230 lines following the exact patterns of `components/AdminDashboard.tsx`: same card/border/label classes `border-stone bg-white p-6`, `text-xs uppercase tracking-[0.15em]`, `font-heading text-ink`, terracotta accents.)

- [ ] **Step 2: Add env vars to `.env.example`**

Append:
```
# Practitioner dashboard
SESSION_SECRET=change-me-in-production
PORTAL_URL=http://localhost:3100
COMMISSION_PERCENT=20
```

- [ ] **Step 3: README — add dashboard section**

Append after the "Mock mode vs live mode" section:
```markdown
## Practitioner dashboard

`/dashboard` — practitioners log in with a magic link (enter email → one-time
15-minute link → 30-day session). Only approved practitioners can log in. In
mock mode (no transactional email sender configured) the login link is shown
on screen and logged to the server console.

Referral links route through the portal (`{PORTAL_URL}/r/CODE`) so clicks are
counted locally, then redirect to the Shopify discount URL. Stats shown:
clicks, orders, conversion rate, and commission (`COMMISSION_PERCENT`, default
20%) — this month and all time. Orders/revenue come from the Shopify Admin API
when credentials exist, otherwise zeros (mock). Stats refresh every 60s
without a page reload and degrade to the last cached values (flagged as stale)
if Shopify is unreachable.
```

- [ ] **Step 4: Full verification**

Run: `npm test && npm run build`
Expected: all suites PASS; build lists `/dashboard`, `/r/[code]`, and the new API routes.

Smoke test:
```bash
ADMIN_PASSWORD=test npm run start &
sleep 4
# approved practitioner exists from seeding via /api/apply with a matched name (mock fetch not available here,
# so instead: request a link for an unknown email — expect {"ok":true,"devLink":null})
curl -s -X POST http://localhost:3100/api/auth/request-link -H 'Content-Type: application/json' -d '{"email":"nobody@example.com"}'
# /r/ with unknown code redirects to homepage
curl -s -o /dev/null -w "%{redirect_url}" http://localhost:3100/r/WN-NOPE-XXXX
kill %1
```

- [ ] **Step 5: Commit and merge**

```bash
git add app/dashboard components/DashboardApp.tsx .env.example README.md
git commit -m "feat: practitioner dashboard UI with magic-link login and live stats"
git checkout main && git merge --no-ff feature/practitioner-dashboard
```

---

## Self-review notes

- Spec coverage: auth tokens/session (T1/T2), enumeration-safe request-link (T2/T4), click redirect + homepage fallback (T1/T4), stats with cache/stale/commission/conversion (T3), session-gated me/stats (T4), UI with copy/empty/loading/polling/tier placeholder/profile (T5), env vars + README (T5).
- Type consistency: `OrderStats`/`DashboardStats`/`StatsProvider`, `sessionCookieHeader` string returns, route response shapes cross-checked against tests.
- Deviation note: Task 5 Step 1 references the AdminDashboard patterns for the component body instead of inlining ~230 lines twice; the executing engineer is this session with full context of those patterns.
