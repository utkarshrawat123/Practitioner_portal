# Patient Carts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A demo-ready feature where a practitioner builds a curated cart for a patient and shares a login-free pay link; paying on a branded Wild Nutrition mock checkout attributes the sale to the practitioner and surfaces in existing Reporting revenue.

**Architecture:** A `lib/commerce/` provider seam (`mock` now, `shopify` later) supplies the catalog and creates the "draft order" (mock → our `/pay/{token}` page). New `patient_carts` + `patient_cart_items` tables store carts. Practitioner APIs build/list/send carts; a public token-gated pay API marks a cart paid and calls the existing `recordOrder` pipeline. Practitioner UI (`/carts`) and a branded patient page (`/pay/[token]`) complete the flow.

**Tech Stack:** Next.js 14 App Router, Turso/libSQL (raw async SQL), React client components, Vitest, existing Gmail SMTP + `recordOrder`. No new dependencies.

## Global Constraints

- DB layer is raw parameterised SQL, all `async`, using the private `run`/`one`/`all` helpers in `lib/db.ts`. No ORM.
- Migrations are append-only in `lib/migrations.ts` (`{ id: 'NNN_name', sql }`, applied once via `executeMultiple`). New id = `016_patient_carts`. Never edit an existing migration.
- Route files export `const dynamic = 'force-dynamic'`. Practitioner routes: `getSessionPractitioner(req)` + require `status === 'approved'` (else 401 `{error:'Unauthorised'}`). Validate bodies with zod; wrap `req.json()` in try/catch → 400.
- **Server always recomputes prices/totals from the catalog — never trust client-sent prices.**
- Money is GBP major units, rounded to 2 dp via `round2(x) = Math.round(x*100)/100`. Demo defaults: discount 10% (`AFFILIATE_DISCOUNT_PERCENT`), commission 20% (`COMMISSION_PERCENT`).
- The demo card form collects nothing that is stored or transmitted; the pay POST ignores any card fields.
- Timestamps via SQLite `datetime('now')` for DB defaults; ISO strings where an app value is needed.
- Repo working tree has many pre-existing uncommitted files. Commit with surgical `git add <named files>` — never `git add -A`. Several files this plan edits (`lib/db.ts`, `lib/migrations.ts`, `components/SiteHeader.tsx`, `components/ChromeGate.tsx`) may be pre-existing-dirty; the controller baselines them before implementation so task commits are clean.
- Keep all existing tests green. Commit co-author trailer exactly: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Commerce provider seam + mock catalog + pricing

**Files:**
- Create: `lib/commerce/types.ts`, `lib/commerce/catalog.mock.ts`, `lib/commerce/index.ts`
- Test: `tests/commerce-mock.test.ts`

**Interfaces — Produces:**
- `CatalogProduct { id: string; title: string; imageUrl: string; price: number; currency: 'GBP' }`
- `DraftOrderInput { token; patientName; patientEmail; items: {productRef;title;unitPrice;qty}[]; subtotal; discountAmount; total; practitionerId }`
- `DraftOrderResult { externalId: string; payUrl: string }`
- `commerceProvider(): 'shopify' | 'mock'`
- `getCatalog(): Promise<CatalogProduct[]>`
- `createDraftOrder(input: DraftOrderInput): Promise<DraftOrderResult>`
- `priceCart(items: {unitPrice:number;qty:number}[]): { subtotal; discountAmount; total; commissionAmount }`
- `round2(n: number): number`, `DISCOUNT_PERCENT`, `COMMISSION_PERCENT`, `MOCK_CATALOG`

- [ ] **Step 1: Write the failing test** — `tests/commerce-mock.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('commerce mock provider', () => {
  it('provider is mock without Shopify env', async () => {
    delete process.env.SHOPIFY_STORE_DOMAIN;
    delete process.env.SHOPIFY_ADMIN_TOKEN;
    const { commerceProvider } = await import('@/lib/commerce');
    expect(commerceProvider()).toBe('mock');
  });

  it('catalog has products with positive GBP prices and images', async () => {
    const { getCatalog } = await import('@/lib/commerce');
    const products = await getCatalog();
    expect(products.length).toBeGreaterThanOrEqual(6);
    for (const p of products) {
      expect(p.price).toBeGreaterThan(0);
      expect(p.currency).toBe('GBP');
      expect(p.imageUrl).toMatch(/^https?:\/\//);
      expect(p.title.length).toBeGreaterThan(0);
    }
  });

  it('priceCart applies 10% discount and 20% commission, rounded', async () => {
    const { priceCart } = await import('@/lib/commerce');
    const r = priceCart([{ unitPrice: 29.6, qty: 2 }, { unitPrice: 15.5, qty: 1 }]); // 74.70
    expect(r.subtotal).toBe(74.7);
    expect(r.discountAmount).toBe(7.47);
    expect(r.total).toBe(67.23);
    expect(r.commissionAmount).toBe(13.45); // round2(67.23*0.2)=13.446→13.45
  });

  it('createDraftOrder (mock) returns our /pay/{token} link', async () => {
    const { createDraftOrder } = await import('@/lib/commerce');
    const res = await createDraftOrder({
      token: 'abc123', patientName: 'Pat', patientEmail: null,
      items: [{ productRef: 'x', title: 'X', unitPrice: 10, qty: 1 }],
      subtotal: 10, discountAmount: 1, total: 9, practitionerId: 1,
    });
    expect(res.externalId).toBe('mock-cart');
    expect(res.payUrl).toBe('/pay/abc123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/commerce-mock.test.ts` → FAIL (module missing).

- [ ] **Step 3: Create `lib/commerce/types.ts`:**

```typescript
export interface CatalogProduct {
  id: string;
  title: string;
  imageUrl: string;
  price: number; // GBP major units
  currency: 'GBP';
}

export interface DraftOrderItem {
  productRef: string;
  title: string;
  unitPrice: number;
  qty: number;
}

export interface DraftOrderInput {
  token: string;
  patientName: string;
  patientEmail: string | null;
  items: DraftOrderItem[];
  subtotal: number;
  discountAmount: number;
  total: number;
  practitionerId: number;
}

export interface DraftOrderResult {
  externalId: string;
  payUrl: string;
}
```

- [ ] **Step 4: Create `lib/commerce/catalog.mock.ts`.** Use these 8 real Wild Nutrition products and realistic GBP prices. Populate each `imageUrl` with the product's real image: fetch each product page under `https://www.wildnutrition.com/products/<handle>` (WebFetch) and take its `og:image` (a `cdn.shopify.com` URL, hotlinkable). If a URL fails to render at build, download it into `public/catalog/<id>.jpg` and use `/catalog/<id>.jpg`. Keep titles/prices exactly as below.

```typescript
import type { CatalogProduct } from './types';

// Curated Wild Nutrition products for the demo (real public product images).
export const MOCK_CATALOG: CatalogProduct[] = [
  { id: 'daily-multi',    title: 'Food-Grown® Daily Multi Nutrient',       imageUrl: 'IMAGE_URL', price: 29.60, currency: 'GBP' },
  { id: 'vitamin-d',      title: 'Food-Grown® Vitamin D',                  imageUrl: 'IMAGE_URL', price: 14.40, currency: 'GBP' },
  { id: 'magnesium',      title: 'Food-Grown® Magnesium',                  imageUrl: 'IMAGE_URL', price: 17.60, currency: 'GBP' },
  { id: 'omega-3',        title: 'Wild Omega 3',                           imageUrl: 'IMAGE_URL', price: 25.60, currency: 'GBP' },
  { id: 'pregnancy',      title: 'Food-Grown® Pregnancy Multi Nutrient',   imageUrl: 'IMAGE_URL', price: 33.60, currency: 'GBP' },
  { id: 'bcomplex',       title: 'Food-Grown® B Complex Plus',             imageUrl: 'IMAGE_URL', price: 21.00, currency: 'GBP' },
  { id: 'gut-love',       title: 'Gut Love Probiotic',                     imageUrl: 'IMAGE_URL', price: 26.40, currency: 'GBP' },
  { id: 'kids-multi',     title: 'Food-Grown® KIDS Multi Nutrient',        imageUrl: 'IMAGE_URL', price: 19.20, currency: 'GBP' },
];
```

Replace every `IMAGE_URL` with the real captured URL. (The test only asserts `https?://` + positive price; if you must fall back to bundled images, use absolute `http(s)` in the test by keeping at least the ones that resolve — or update the test's regex to also accept `^/catalog/`.)

- [ ] **Step 5: Create `lib/commerce/index.ts`:**

```typescript
import type { CatalogProduct, DraftOrderInput, DraftOrderResult } from './types';
import { MOCK_CATALOG } from './catalog.mock';

export type { CatalogProduct, DraftOrderInput, DraftOrderResult } from './types';
export { MOCK_CATALOG } from './catalog.mock';

export const DISCOUNT_PERCENT = Number(process.env.AFFILIATE_DISCOUNT_PERCENT ?? 10);
export const COMMISSION_PERCENT = Number(process.env.COMMISSION_PERCENT ?? 20);

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function priceCart(items: { unitPrice: number; qty: number }[]): {
  subtotal: number; discountAmount: number; total: number; commissionAmount: number;
} {
  const subtotal = round2(items.reduce((s, i) => s + i.unitPrice * i.qty, 0));
  const discountAmount = round2(subtotal * (DISCOUNT_PERCENT / 100));
  const total = round2(subtotal - discountAmount);
  const commissionAmount = round2(total * (COMMISSION_PERCENT / 100));
  return { subtotal, discountAmount, total, commissionAmount };
}

/** 'shopify' when store creds are set, else 'mock' (the demo default). */
export function commerceProvider(): 'shopify' | 'mock' {
  return process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_TOKEN ? 'shopify' : 'mock';
}

export async function getCatalog(): Promise<CatalogProduct[]> {
  // The shopify branch (products API) is future work; the demo returns the mock catalog.
  return MOCK_CATALOG;
}

/** Mock: the pay link is our own branded page keyed by the cart token. */
export async function createDraftOrder(input: DraftOrderInput): Promise<DraftOrderResult> {
  return { externalId: 'mock-cart', payUrl: `/pay/${input.token}` };
}
```

- [ ] **Step 6: Run test to verify it passes** — `npx vitest run tests/commerce-mock.test.ts` → PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/commerce/types.ts lib/commerce/catalog.mock.ts lib/commerce/index.ts tests/commerce-mock.test.ts public/catalog 2>/dev/null
git commit -m "feat: commerce provider seam + mock Wild Nutrition catalog + pricing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(If no `public/catalog` dir was created, drop it from the add.)

---

### Task 2: DB layer — migration 016 + patient cart tables + helpers

**Files:**
- Modify: `lib/migrations.ts` (append `016_patient_carts`), `lib/db.ts` (types + helpers)
- Test: `tests/patient-carts-db.test.ts`

**Interfaces — Consumes:** none. **Produces:**
- Types `PatientCartItem { id; title; imageUrl; unitPrice; qty; productRef }`, `PatientCart { id; practitionerId; patientName; patientEmail; token; status; currency; subtotal; discountAmount; total; commissionAmount; provider; externalId; payUrl; createdAt; sentAt; paidAt; items? }`
- `createPatientCart(input): Promise<PatientCart>` — input `{ practitionerId; patientName; patientEmail; token; provider; externalId; payUrl; subtotal; discountAmount; total; commissionAmount; currency; items: {productRef;title;imageUrl;unitPrice;qty}[] }`
- `listPatientCartsForPractitioner(practitionerId): Promise<PatientCart[]>` (newest first, no items)
- `getCartByToken(token): Promise<PatientCart | null>` (with `items`)
- `markCartSent(id): Promise<void>`
- `markCartPaid(id): Promise<void>` (sets status='paid', paid_at; idempotent)

- [ ] **Step 1: Write the failing test** — `tests/patient-carts-db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-carts-db-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved(email = 'p@example.com') {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({
    name: 'Prac One', email, registerBody: 'BANT', registerNumber: '12345', qualificationStatus: 'qualified',
  });
  await markApproved(p.id, { affiliateCode: `WN-${p.id}-AB2C`, affiliateLink: 'http://x', pendingSync: false, decidedBy: 'system' });
  return p;
}

async function makeCart(practitionerId: number, token = 'tok_abc') {
  const db = await import('@/lib/db');
  return db.createPatientCart({
    practitionerId, patientName: 'Patient Pat', patientEmail: 'pat@example.com', token,
    provider: 'mock', externalId: 'mock-cart', payUrl: `/pay/${token}`,
    subtotal: 74.7, discountAmount: 7.47, total: 67.23, commissionAmount: 13.45, currency: 'GBP',
    items: [{ productRef: 'daily-multi', title: 'Daily Multi', imageUrl: 'http://x/i.jpg', unitPrice: 29.6, qty: 2 },
            { productRef: 'vitamin-d', title: 'Vitamin D', imageUrl: 'http://x/d.jpg', unitPrice: 15.5, qty: 1 }],
  });
}

describe('patient carts db', () => {
  it('creates a cart with items and reads it back by token', async () => {
    const p = await seedApproved();
    const db = await import('@/lib/db');
    const created = await makeCart(p.id);
    expect(created.id).toBeGreaterThan(0);
    expect(created.status).toBe('draft');
    const byToken = await db.getCartByToken('tok_abc');
    expect(byToken!.total).toBe(67.23);
    expect(byToken!.items!.length).toBe(2);
    expect(byToken!.items![0].qty).toBe(2);
  });

  it('lists a practitioner\'s carts, newest first, and isolates by practitioner', async () => {
    const a = await seedApproved('a@example.com');
    const b = await seedApproved('b@example.com');
    const db = await import('@/lib/db');
    await makeCart(a.id, 't1');
    await makeCart(b.id, 't2');
    const listA = await db.listPatientCartsForPractitioner(a.id);
    expect(listA.length).toBe(1);
    expect(listA[0].patientName).toBe('Patient Pat');
  });

  it('markCartPaid sets status and is idempotent', async () => {
    const p = await seedApproved();
    const db = await import('@/lib/db');
    const c = await makeCart(p.id);
    await db.markCartPaid(c.id);
    let again = await db.getCartByToken('tok_abc');
    expect(again!.status).toBe('paid');
    expect(again!.paidAt).not.toBeNull();
    await db.markCartPaid(c.id); // idempotent — no throw, still paid
    again = await db.getCartByToken('tok_abc');
    expect(again!.status).toBe('paid');
  });

  it('markCartSent sets status to sent', async () => {
    const p = await seedApproved();
    const db = await import('@/lib/db');
    const c = await makeCart(p.id);
    await db.markCartSent(c.id);
    const s = await db.getCartByToken('tok_abc');
    expect(s!.status).toBe('sent');
    expect(s!.sentAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/patient-carts-db.test.ts` → FAIL.

- [ ] **Step 3: Append migration `016_patient_carts` to `lib/migrations.ts`** (after `015_presence`, before the closing `];`):

```typescript
  {
    id: '016_patient_carts',
    sql: `
CREATE TABLE IF NOT EXISTS patient_carts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  patient_name TEXT NOT NULL,
  patient_email TEXT,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  currency TEXT NOT NULL DEFAULT 'GBP',
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  commission_amount REAL NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'mock',
  external_id TEXT,
  pay_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_patient_carts_practitioner ON patient_carts(practitioner_id);
CREATE TABLE IF NOT EXISTS patient_cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id INTEGER NOT NULL REFERENCES patient_carts(id),
  product_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT,
  unit_price REAL NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_patient_cart_items_cart ON patient_cart_items(cart_id);
`,
  },
```

- [ ] **Step 4: Add types + helpers to `lib/db.ts`** (place near the orders section). Use the private `run`/`one`/`all`/`num` helpers:

```typescript
export type PatientCartStatus = 'draft' | 'sent' | 'paid';
export interface PatientCartItem {
  id: number; productRef: string; title: string; imageUrl: string | null; unitPrice: number; qty: number;
}
export interface PatientCart {
  id: number; practitionerId: number; patientName: string; patientEmail: string | null;
  token: string; status: PatientCartStatus; currency: string;
  subtotal: number; discountAmount: number; total: number; commissionAmount: number;
  provider: string; externalId: string | null; payUrl: string;
  createdAt: string; sentAt: string | null; paidAt: string | null;
  items?: PatientCartItem[];
}

function rowToCart(r: Row): PatientCart {
  return {
    id: num(r.id), practitionerId: num(r.practitioner_id),
    patientName: r.patient_name as string, patientEmail: (r.patient_email as string | null) ?? null,
    token: r.token as string, status: (r.status as string) as PatientCartStatus,
    currency: r.currency as string,
    subtotal: Number(r.subtotal), discountAmount: Number(r.discount_amount),
    total: Number(r.total), commissionAmount: Number(r.commission_amount),
    provider: r.provider as string, externalId: (r.external_id as string | null) ?? null,
    payUrl: r.pay_url as string, createdAt: r.created_at as string,
    sentAt: (r.sent_at as string | null) ?? null, paidAt: (r.paid_at as string | null) ?? null,
  };
}

export interface CreatePatientCartInput {
  practitionerId: number; patientName: string; patientEmail: string | null; token: string;
  provider: string; externalId: string | null; payUrl: string;
  subtotal: number; discountAmount: number; total: number; commissionAmount: number; currency: string;
  items: { productRef: string; title: string; imageUrl: string | null; unitPrice: number; qty: number }[];
}

export async function createPatientCart(input: CreatePatientCartInput): Promise<PatientCart> {
  const res = await run(
    `INSERT INTO patient_carts
       (practitioner_id, patient_name, patient_email, token, currency, subtotal, discount_amount, total, commission_amount, provider, external_id, pay_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.practitionerId, input.patientName, input.patientEmail, input.token, input.currency,
     input.subtotal, input.discountAmount, input.total, input.commissionAmount,
     input.provider, input.externalId, input.payUrl]
  );
  const cartId = res.lastInsertRowid;
  for (const it of input.items) {
    await run(
      `INSERT INTO patient_cart_items (cart_id, product_ref, title, image_url, unit_price, qty)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cartId, it.productRef, it.title, it.imageUrl, it.unitPrice, it.qty]
    );
  }
  return (await getCartById(cartId))!;
}

async function getCartById(id: number): Promise<PatientCart | null> {
  const row = await one(`SELECT * FROM patient_carts WHERE id = ?`, [id]);
  return row ? rowToCart(row) : null;
}

async function loadItems(cartId: number): Promise<PatientCartItem[]> {
  const rows = await all(`SELECT * FROM patient_cart_items WHERE cart_id = ? ORDER BY id`, [cartId]);
  return rows.map((r) => ({
    id: num(r.id), productRef: r.product_ref as string, title: r.title as string,
    imageUrl: (r.image_url as string | null) ?? null, unitPrice: Number(r.unit_price), qty: num(r.qty),
  }));
}

export async function getCartByToken(token: string): Promise<PatientCart | null> {
  const row = await one(`SELECT * FROM patient_carts WHERE token = ?`, [token]);
  if (!row) return null;
  const cart = rowToCart(row);
  cart.items = await loadItems(cart.id);
  return cart;
}

export async function listPatientCartsForPractitioner(practitionerId: number): Promise<PatientCart[]> {
  const rows = await all(
    `SELECT * FROM patient_carts WHERE practitioner_id = ? ORDER BY id DESC`, [practitionerId]);
  return rows.map(rowToCart);
}

export async function markCartSent(id: number): Promise<void> {
  await run(`UPDATE patient_carts SET status = 'sent', sent_at = datetime('now') WHERE id = ?`, [id]);
}

export async function markCartPaid(id: number): Promise<void> {
  await run(`UPDATE patient_carts SET status = 'paid', paid_at = datetime('now') WHERE id = ? AND status != 'paid'`, [id]);
}
```

- [ ] **Step 5: Run tests to verify they pass** — `npx vitest run tests/patient-carts-db.test.ts` → PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/migrations.ts lib/db.ts tests/patient-carts-db.test.ts
git commit -m "feat: patient_carts schema (migration 016) + cart db helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Practitioner APIs — catalog, create/list carts, send

**Files:**
- Create: `app/api/me/catalog/route.ts`, `app/api/me/carts/route.ts`, `app/api/me/carts/[id]/send/route.ts`
- Test: `tests/api-carts.test.ts`

**Interfaces — Consumes:** `getCatalog`, `priceCart`, `createDraftOrder`, `round2` (Task 1); `createPatientCart`, `listPatientCartsForPractitioner`, `getCartByToken` (Task 2); `getSessionPractitioner`; `sendSmtpEmail` (`lib/providers/smtp`). **Produces:** the three routes described in the spec.

- [ ] **Step 1: Write the failing test** — `tests/api-carts.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-carts-api-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedApproved(email = 'p@example.com') {
  const { insertApplication, markApproved } = await import('@/lib/db');
  const p = await insertApplication({ name: 'Prac One', email, registerBody: 'BANT', registerNumber: '12345', qualificationStatus: 'qualified' });
  await markApproved(p.id, { affiliateCode: `WN-${p.id}-AB2C`, affiliateLink: 'http://x', pendingSync: false, decidedBy: 'system' });
  return p;
}
async function pHeaders(id: number) {
  const { sessionCookieHeader } = await import('@/lib/practitionerAuth');
  return { cookie: sessionCookieHeader(id).split(';')[0], 'Content-Type': 'application/json' };
}

describe('patient carts API', () => {
  it('GET /api/me/catalog 401 unauth, returns products when authed', async () => {
    const p = await seedApproved();
    const { GET } = await import('@/app/api/me/catalog/route');
    expect((await GET(new Request('http://x/api/me/catalog'))).status).toBe(401);
    const ok = await GET(new Request('http://x/api/me/catalog', { headers: await pHeaders(p.id) }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).products.length).toBeGreaterThan(0);
  });

  it('POST /api/me/carts recomputes totals server-side and ignores client prices', async () => {
    const p = await seedApproved();
    const { getCatalog } = await import('@/lib/commerce');
    const cat = await getCatalog();
    const { POST } = await import('@/app/api/me/carts/route');
    const res = await POST(new Request('http://x/api/me/carts', {
      method: 'POST', headers: await pHeaders(p.id),
      body: JSON.stringify({ patientName: 'Pat', patientEmail: 'pat@example.com',
        items: [{ productRef: cat[0].id, qty: 2, unitPrice: 0.01 /* malicious */ }] }),
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.cart.subtotal).toBeCloseTo(cat[0].price * 2, 2); // server used the catalog price, not 0.01
    expect(body.payUrl).toMatch(/^\/pay\//);
  });

  it('POST /api/me/carts 400 on empty items', async () => {
    const p = await seedApproved();
    const { POST } = await import('@/app/api/me/carts/route');
    const res = await POST(new Request('http://x/api/me/carts', {
      method: 'POST', headers: await pHeaders(p.id), body: JSON.stringify({ patientName: 'Pat', items: [] }) }));
    expect(res.status).toBe(400);
  });

  it('GET /api/me/carts returns only the caller\'s carts', async () => {
    const a = await seedApproved('a@example.com');
    const b = await seedApproved('b@example.com');
    const { getCatalog } = await import('@/lib/commerce');
    const cat = await getCatalog();
    const { POST, GET } = await import('@/app/api/me/carts/route');
    await POST(new Request('http://x/api/me/carts', { method: 'POST', headers: await pHeaders(a.id),
      body: JSON.stringify({ patientName: 'A pat', items: [{ productRef: cat[0].id, qty: 1 }] }) }));
    const listB = await GET(new Request('http://x/api/me/carts', { headers: await pHeaders(b.id) }));
    expect((await listB.json()).carts.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/api-carts.test.ts` → FAIL.

- [ ] **Step 3: Create `app/api/me/catalog/route.ts`:**

```typescript
import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { getCatalog } from '@/lib/commerce';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  return NextResponse.json({ products: await getCatalog() });
}
```

- [ ] **Step 4: Create `app/api/me/carts/route.ts`:**

```typescript
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { getCatalog, priceCart, createDraftOrder } from '@/lib/commerce';
import { createPatientCart, listPatientCartsForPractitioner } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  patientName: z.string().trim().min(1).max(120),
  patientEmail: z.string().trim().email().max(200).optional().or(z.literal('')),
  items: z.array(z.object({ productRef: z.string().min(1), qty: z.number().int().positive().max(99) })).min(1),
});

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  return NextResponse.json({ carts: await listPatientCartsForPractitioner(p.id) });
}

export async function POST(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'A patient name and at least one item are required' }, { status: 400 });

  const catalog = await getCatalog();
  // Build line items from the CATALOG (server-trusted prices), not the client.
  const items = parsed.data.items.map((i) => {
    const product = catalog.find((c) => c.id === i.productRef);
    if (!product) return null;
    return { productRef: product.id, title: product.title, imageUrl: product.imageUrl, unitPrice: product.price, qty: i.qty };
  });
  if (items.some((i) => i === null)) return NextResponse.json({ error: 'Unknown product in cart' }, { status: 400 });
  const lineItems = items as { productRef: string; title: string; imageUrl: string; unitPrice: number; qty: number }[];

  const totals = priceCart(lineItems);
  const token = randomBytes(24).toString('hex');
  const draft = await createDraftOrder({
    token, patientName: parsed.data.patientName, patientEmail: parsed.data.patientEmail || null,
    items: lineItems, subtotal: totals.subtotal, discountAmount: totals.discountAmount, total: totals.total,
    practitionerId: p.id,
  });

  const cart = await createPatientCart({
    practitionerId: p.id, patientName: parsed.data.patientName, patientEmail: parsed.data.patientEmail || null,
    token, provider: draft.externalId === 'mock-cart' ? 'mock' : 'shopify', externalId: draft.externalId,
    payUrl: draft.payUrl, currency: 'GBP',
    subtotal: totals.subtotal, discountAmount: totals.discountAmount, total: totals.total, commissionAmount: totals.commissionAmount,
    items: lineItems,
  });
  return NextResponse.json({ cart, payUrl: draft.payUrl }, { status: 201 });
}
```

- [ ] **Step 5: Create `app/api/me/carts/[id]/send/route.ts`:**

```typescript
import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { listPatientCartsForPractitioner, markCartSent } from '@/lib/db';
import { sendSmtpEmail } from '@/lib/providers/smtp';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  const cart = (await listPatientCartsForPractitioner(p.id)).find((c) => c.id === id);
  if (!cart) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!cart.patientEmail) return NextResponse.json({ error: 'This cart has no patient email' }, { status: 400 });

  const origin = new URL(req.url).origin;
  const link = `${origin}${cart.payUrl}`;
  const html = `<p>Hi ${cart.patientName},</p><p>${p.name} has prepared a Wild Nutrition order for you. You can review and pay here:</p><p><a href="${link}">${link}</a></p><p>Total: £${cart.total.toFixed(2)}</p>`;
  const result = await sendSmtpEmail({ to: cart.patientEmail, subject: `Your Wild Nutrition order from ${p.name}`, html });
  await markCartSent(cart.id);
  return NextResponse.json({ ok: true, delivered: result.ok, detail: result.detail });
}
```

- [ ] **Step 6: Run tests to verify they pass** — `npx vitest run tests/api-carts.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/me/catalog/route.ts app/api/me/carts/route.ts "app/api/me/carts/[id]/send/route.ts" tests/api-carts.test.ts
git commit -m "feat: practitioner cart APIs (catalog, create/list, send)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Public pay API — view + pay (attribution via recordOrder)

**Files:**
- Create: `app/api/pay/[token]/route.ts`
- Test: `tests/api-pay.test.ts`

**Interfaces — Consumes:** `getCartByToken`, `markCartPaid`, `getPractitioner`, `recordOrder` (`lib/db`). **Produces:**
- `GET /api/pay/[token]` → `{ practitionerName, patientName, items, subtotal, discount, total, currency, status }`; 404 on unknown token.
- `POST /api/pay/[token]` → marks paid + records the order for the practitioner (idempotent); returns `{ status: 'paid', total }`.

- [ ] **Step 1: Write the failing test** — `tests/api-pay.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-pay-api-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});
afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedCart() {
  const db = await import('@/lib/db');
  const p = await db.insertApplication({ name: 'Prac One', email: 'p@example.com', registerBody: 'BANT', registerNumber: '1', qualificationStatus: 'qualified' });
  await db.markApproved(p.id, { affiliateCode: `WN-${p.id}-AB2C`, affiliateLink: 'http://x', pendingSync: false, decidedBy: 'system' });
  const cart = await db.createPatientCart({
    practitionerId: p.id, patientName: 'Pat', patientEmail: null, token: 'paytok',
    provider: 'mock', externalId: 'mock-cart', payUrl: '/pay/paytok', currency: 'GBP',
    subtotal: 50, discountAmount: 5, total: 45, commissionAmount: 9,
    items: [{ productRef: 'x', title: 'X', imageUrl: null, unitPrice: 25, qty: 2 }],
  });
  return { p, cart };
}

describe('pay API', () => {
  it('GET 404 on unknown token, returns cart on good token', async () => {
    await seedCart();
    const { GET } = await import('@/app/api/pay/[token]/route');
    expect((await GET(new Request('http://x/api/pay/nope'), { params: { token: 'nope' } })).status).toBe(404);
    const ok = await GET(new Request('http://x/api/pay/paytok'), { params: { token: 'paytok' } });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.practitionerName).toBe('Prac One');
    expect(body.total).toBe(45);
    expect(body.items.length).toBe(1);
  });

  it('POST marks paid and records an order for the practitioner; idempotent', async () => {
    const { p } = await seedCart();
    const { POST } = await import('@/app/api/pay/[token]/route');
    const db = await import('@/lib/db');
    const code = `WN-${p.id}-AB2C`;
    const res = await POST(new Request('http://x/api/pay/paytok', { method: 'POST' }), { params: { token: 'paytok' } });
    expect(res.status).toBe(200);
    expect((await db.getCartByToken('paytok'))!.status).toBe('paid');
    // Exactly one order recorded for the practitioner's code (order_id is unique).
    const after1 = await db.execForTests('SELECT COUNT(*) AS n, SUM(total) AS t FROM orders WHERE code = ?', [code]);
    expect(Number(after1.rows[0].n)).toBe(1);
    expect(Number(after1.rows[0].t)).toBe(45);
    // Second POST must not double-record.
    await POST(new Request('http://x/api/pay/paytok', { method: 'POST' }), { params: { token: 'paytok' } });
    const after2 = await db.execForTests('SELECT COUNT(*) AS n FROM orders WHERE code = ?', [code]);
    expect(Number(after2.rows[0].n)).toBe(1);
  });
});
```

(Verified: `lib/db.ts` has no `ordersForCode`; `execForTests(sql, args)` and `orderStatsByCode` do exist. The test uses `execForTests` for a deterministic count.)

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/api-pay.test.ts` → FAIL.

- [ ] **Step 3: Create `app/api/pay/[token]/route.ts`:**

```typescript
import { NextResponse } from 'next/server';
import { getCartByToken, markCartPaid, getPractitioner, recordOrder } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { token: string } }): Promise<NextResponse> {
  const cart = await getCartByToken(params.token);
  if (!cart) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const practitioner = await getPractitioner(cart.practitionerId);
  return NextResponse.json({
    practitionerName: practitioner?.name ?? 'Your practitioner',
    patientName: cart.patientName,
    items: (cart.items ?? []).map((i) => ({ title: i.title, imageUrl: i.imageUrl, unitPrice: i.unitPrice, qty: i.qty })),
    subtotal: cart.subtotal, discount: cart.discountAmount, total: cart.total, currency: cart.currency,
    status: cart.status,
  });
}

/** Mock payment: mark paid + attribute to the practitioner via the existing orders pipeline. */
export async function POST(_req: Request, { params }: { params: { token: string } }): Promise<NextResponse> {
  const cart = await getCartByToken(params.token);
  if (!cart) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (cart.status !== 'paid') {
    await markCartPaid(cart.id);
    const practitioner = await getPractitioner(cart.practitionerId);
    await recordOrder({
      orderId: `cart-${cart.id}`,
      practitionerId: cart.practitionerId,
      code: practitioner?.affiliateCode ?? `cart-${cart.id}`,
      total: cart.total,
      currency: cart.currency,
      financialStatus: 'paid',
      createdAt: new Date().toISOString(),
    });
  }
  return NextResponse.json({ status: 'paid', total: cart.total });
}
```

- [ ] **Step 4: Run tests to verify they pass** — `npx vitest run tests/api-pay.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/pay/[token]/route.ts" tests/api-pay.test.ts
git commit -m "feat: public pay API — view cart + mock pay with practitioner attribution

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Practitioner UI — /carts builder + nav link

**Files:**
- Create: `app/carts/page.tsx`, `components/CartsApp.tsx`
- Modify: `components/SiteHeader.tsx` (add nav item)

**Interfaces — Consumes:** `/api/me/catalog`, `/api/me/carts` (GET/POST), `/api/me/carts/[id]/send`. UI only — verified in the browser.

- [ ] **Step 1: Add the nav link in `components/SiteHeader.tsx`** — add to `PRACTITIONER_NAV` after the Toolkit entry:

```typescript
  { label: 'Patient Carts', href: '/carts' },
```

- [ ] **Step 2: Create `app/carts/page.tsx`** (server shell — mirrors other practitioner pages; redirects if not signed in):

```tsx
import { redirect } from 'next/navigation';
import { getServerSessionPractitioner } from '@/lib/serverSession';
import CartsApp from '@/components/CartsApp';

export const metadata = { title: 'Patient Carts | Wild Nutrition' };

export default async function CartsPage() {
  const practitioner = await getServerSessionPractitioner();
  if (!practitioner || practitioner.status !== 'approved') redirect('/dashboard');
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-heading text-3xl text-ink">Patient Carts</h1>
      <p className="mt-2 text-sm text-ink2/70">Build a cart for a patient and share a secure link to pay.</p>
      <CartsApp practitionerName={practitioner.name} />
    </div>
  );
}
```

(If `getServerSessionPractitioner` is not the correct server-session helper, grep `serverSession.ts` and use its exported function — it is used the same way in `app/dashboard/page.tsx`.)

- [ ] **Step 3: Create `components/CartsApp.tsx`:**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

interface Product { id: string; title: string; imageUrl: string; price: number; currency: string }
interface Cart {
  id: number; patientName: string; patientEmail: string | null; status: string;
  subtotal: number; discountAmount: number; total: number; commissionAmount: number; payUrl: string;
}

const money = (n: number) => `£${n.toFixed(2)}`;

export default function CartsApp({ practitionerName }: { practitionerName: string }) {
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [patientName, setPatientName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [carts, setCarts] = useState<Cart[]>([]);
  const [created, setCreated] = useState<{ cart: Cart; link: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sentMsg, setSentMsg] = useState('');

  const loadCarts = useCallback(async () => {
    const r = await fetch('/api/me/carts', { cache: 'no-store' });
    if (r.ok) setCarts((await r.json()).carts);
  }, []);

  useEffect(() => {
    fetch('/api/me/catalog', { cache: 'no-store' }).then(async (r) => { if (r.ok) setCatalog((await r.json()).products); });
    loadCarts();
  }, [loadCarts]);

  const lines = catalog.map((p) => ({ p, q: qty[p.id] ?? 0 })).filter((l) => l.q > 0);
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.q, 0);
  const discount = Math.round(subtotal * 0.1 * 100) / 100;
  const total = Math.round((subtotal - discount) * 100) / 100;
  const commission = Math.round(total * 0.2 * 100) / 100;

  function setItemQty(id: string, q: number) { setQty((m) => ({ ...m, [id]: Math.max(0, q) })); }

  async function createCart() {
    if (!patientName.trim() || lines.length === 0 || busy) return;
    setBusy(true); setSentMsg('');
    const res = await fetch('/api/me/carts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientName, patientEmail: patientEmail || undefined,
        items: lines.map((l) => ({ productRef: l.p.id, qty: l.q })) }),
    });
    if (res.ok) {
      const body = await res.json();
      setCreated({ cart: body.cart, link: `${window.location.origin}${body.payUrl}` });
      setQty({}); setPatientName(''); setPatientEmail('');
      loadCarts();
    }
    setBusy(false);
  }

  async function copyLink(link: string) { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }

  async function sendToPatient(cartId: number) {
    setSentMsg('');
    const res = await fetch(`/api/me/carts/${cartId}/send`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setSentMsg(res.ok ? 'Sent to patient.' : (body.error ?? 'Could not send.'));
    loadCarts();
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div>
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <input value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="Patient name"
            className="border border-stone px-4 py-2.5 text-sm focus:border-terracotta focus:outline-none" />
          <input value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} placeholder="Patient email (optional)"
            className="border border-stone px-4 py-2.5 text-sm focus:border-terracotta focus:outline-none" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {catalog.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border border-stone bg-white p-3">
              <img src={p.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                <p className="text-xs text-ink2/60">{money(p.price)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setItemQty(p.id, (qty[p.id] ?? 0) - 1)} className="h-7 w-7 border border-stone text-ink2">–</button>
                <span className="w-6 text-center text-sm">{qty[p.id] ?? 0}</span>
                <button onClick={() => setItemQty(p.id, (qty[p.id] ?? 0) + 1)} className="h-7 w-7 border border-stone text-ink2">+</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside className="h-fit border border-stone bg-cream p-5">
        <p className="text-xs uppercase tracking-[0.15em] text-forest">Cart summary</p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-ink2/70">Subtotal</dt><dd>{money(subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink2/70">Patient discount (10%)</dt><dd>−{money(discount)}</dd></div>
          <div className="flex justify-between font-medium text-ink"><dt>Total</dt><dd>{money(total)}</dd></div>
          <div className="flex justify-between border-t border-stone pt-1.5 text-forest"><dt>You earn (20%)</dt><dd>{money(commission)}</dd></div>
        </dl>
        <button disabled={busy || !patientName.trim() || lines.length === 0} onClick={createCart}
          className="mt-4 w-full bg-terracotta px-4 py-2.5 text-xs uppercase tracking-[0.15em] text-cream disabled:opacity-50">
          Create pay link
        </button>

        {created && (
          <div className="mt-4 border-t border-stone pt-4">
            <p className="text-xs text-ink2/70">Pay link for {created.cart.patientName}:</p>
            <p className="mt-1 break-all text-xs text-ink">{created.link}</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => copyLink(created.link)} className="flex-1 border border-ink px-3 py-1.5 text-xs uppercase tracking-[0.15em]">{copied ? 'Copied' : 'Copy link'}</button>
              {created.cart.patientEmail && (
                <button onClick={() => sendToPatient(created.cart.id)} className="flex-1 bg-forest px-3 py-1.5 text-xs uppercase tracking-[0.15em] text-cream">Send to patient</button>
              )}
            </div>
            {sentMsg && <p className="mt-2 text-xs text-forest">{sentMsg}</p>}
          </div>
        )}
      </aside>

      <div className="lg:col-span-2">
        <h2 className="mt-4 text-xs uppercase tracking-[0.15em] text-ink2/70">Your carts</h2>
        <div className="mt-3 divide-y divide-stone border border-stone bg-white">
          {carts.length === 0 && <p className="p-4 text-sm text-ink2/60">No carts yet.</p>}
          {carts.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div><span className="font-medium text-ink">{c.patientName}</span> <span className="text-ink2/60">· {money(c.total)}</span></div>
              <div className="flex items-center gap-4">
                <span className="text-forest">You earn {money(c.commissionAmount)}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-wide ${c.status === 'paid' ? 'bg-forest text-cream' : c.status === 'sent' ? 'bg-sage/50 text-ink' : 'bg-stone/50 text-ink2'}`}>{c.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check** — `npx tsc --noEmit` → no NEW errors in `CartsApp.tsx` / `app/carts/page.tsx` (ignore the ~10 pre-existing errors in unrelated files).

- [ ] **Step 5: Commit**

```bash
git add app/carts/page.tsx components/CartsApp.tsx components/SiteHeader.tsx
git commit -m "feat: practitioner Patient Carts UI + nav link

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Patient pay page — /pay/[token] (branded mock checkout)

**Files:**
- Create: `app/pay/[token]/page.tsx`, `components/PayPage.tsx`
- Modify: `components/ChromeGate.tsx` (hide global chrome on `/pay`)

**Interfaces — Consumes:** `/api/pay/[token]` (GET/POST). UI only — verified in the browser.

- [ ] **Step 1: Hide site chrome on `/pay` in `components/ChromeGate.tsx`** — update the guard:

```typescript
  if (pathname?.startsWith('/onboarding') || pathname?.startsWith('/admin') || pathname?.startsWith('/pay')) return null;
```

- [ ] **Step 2: Create `app/pay/[token]/page.tsx`:**

```tsx
import PayPage from '@/components/PayPage';

export const metadata = { title: 'Complete your order | Wild Nutrition' };

export default function PayRoute({ params }: { params: { token: string } }) {
  return <PayPage token={params.token} />;
}
```

- [ ] **Step 3: Create `components/PayPage.tsx`:**

```tsx
'use client';

import { useEffect, useState } from 'react';

interface Item { title: string; imageUrl: string | null; unitPrice: number; qty: number }
interface CartView {
  practitionerName: string; patientName: string; items: Item[];
  subtotal: number; discount: number; total: number; currency: string; status: string;
}

const money = (n: number) => `£${n.toFixed(2)}`;

export default function PayPage({ token }: { token: string }) {
  const [cart, setCart] = useState<CartView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    fetch(`/api/pay/${token}`, { cache: 'no-store' }).then(async (r) => {
      if (r.status === 404) { setNotFound(true); return; }
      const data = await r.json();
      setCart(data); if (data.status === 'paid') setPaid(true);
    });
  }, [token]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setPaying(true);
    const r = await fetch(`/api/pay/${token}`, { method: 'POST' });
    if (r.ok) setPaid(true);
    setPaying(false);
  }

  if (notFound) return <main className="mx-auto max-w-md px-6 py-24 text-center"><p className="text-ink2">This payment link is not valid.</p></main>;
  if (!cart) return <main className="mx-auto max-w-md px-6 py-24 text-center text-ink2/60">Loading…</main>;

  return (
    <main className="min-h-screen bg-cream">
      <header className="border-b border-stone bg-cream">
        <div className="mx-auto max-w-2xl px-6 py-5 font-heading text-2xl tracking-wide text-ink">
          Wild Nutrition<sup className="align-super text-xs">®</sup>
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-6 py-10">
        {paid ? (
          <div className="border border-sage bg-white p-8 text-center">
            <h1 className="font-heading text-3xl text-forest">Payment successful</h1>
            <p className="mt-2 text-ink2/80">Thank you, {cart.patientName}. Your order is confirmed.</p>
          </div>
        ) : (
          <>
            <h1 className="font-heading text-3xl text-ink">Hi {cart.patientName},</h1>
            <p className="mt-1 text-ink2/80">{cart.practitionerName} has prepared this order for you.</p>

            <div className="mt-6 divide-y divide-stone border border-stone bg-white">
              {cart.items.map((i, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3">
                  {i.imageUrl && <img src={i.imageUrl} alt="" className="h-14 w-14 rounded object-cover" />}
                  <div className="flex-1"><p className="text-sm font-medium text-ink">{i.title}</p><p className="text-xs text-ink2/60">Qty {i.qty}</p></div>
                  <p className="text-sm">{money(i.unitPrice * i.qty)}</p>
                </div>
              ))}
            </div>

            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink2/70">Subtotal</dt><dd>{money(cart.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink2/70">Discount</dt><dd>−{money(cart.discount)}</dd></div>
              <div className="flex justify-between text-lg font-medium text-ink"><dt>Total</dt><dd>{money(cart.total)}</dd></div>
            </dl>

            <form onSubmit={pay} className="mt-6 border border-stone bg-white p-5">
              <p className="mb-3 rounded bg-sage/30 px-3 py-2 text-xs text-ink2">Demo checkout — no real payment is taken.</p>
              <div className="grid gap-3">
                <input required placeholder="Cardholder name" className="border border-stone px-4 py-2.5 text-sm focus:border-terracotta focus:outline-none" />
                <input required defaultValue="4242 4242 4242 4242" inputMode="numeric" className="border border-stone px-4 py-2.5 text-sm focus:border-terracotta focus:outline-none" />
                <div className="grid grid-cols-2 gap-3">
                  <input required placeholder="MM / YY" defaultValue="12 / 28" className="border border-stone px-4 py-2.5 text-sm focus:border-terracotta focus:outline-none" />
                  <input required placeholder="CVC" defaultValue="123" className="border border-stone px-4 py-2.5 text-sm focus:border-terracotta focus:outline-none" />
                </div>
              </div>
              <button disabled={paying} className="mt-4 w-full bg-terracotta px-6 py-3 text-xs uppercase tracking-[0.2em] text-cream disabled:opacity-50">
                {paying ? 'Processing…' : `Pay ${money(cart.total)}`}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Type-check** — `npx tsc --noEmit` → no NEW errors in `PayPage.tsx` / `app/pay/[token]/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add "app/pay/[token]/page.tsx" components/PayPage.tsx components/ChromeGate.tsx
git commit -m "feat: branded patient pay page (mock checkout)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Full suite + build + end-to-end demo verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite** — stop any dev server first, then `npm test` → all prior tests plus the new `commerce-mock`, `patient-carts-db`, `api-carts`, `api-pay` suites PASS.

- [ ] **Step 2: Build gate** — `npm run build` → compiles clean; routes `/carts` and `/pay/[token]` and the three `/api/me/carts*` + `/api/pay/[token]` appear.

- [ ] **Step 3: Browser demo run** — start `portal-dev`; sign in as an approved practitioner:
  1. Open `/carts` → add 2–3 products, enter a patient name → totals + "You earn £X" update → "Create pay link" → copy the link.
  2. Open the pay link (`/pay/{token}`) → confirm the branded page shows the items + total + demo notice → click "Pay" → "Payment successful".
  3. Open `/admin` → Applications/Reporting → confirm the revenue reflects the new paid order (attribution worked).
  Capture screenshots of the cart builder, the pay page, and the success state. Confirm no console errors.

- [ ] **Step 4: (Only if the user asks to ship) Deploy** — `npx vercel --prod --yes`; migration 016 applies on first DB connection; spot-check `/carts` (signed in) and a fresh cart's `/pay/{token}` live.

---

## Self-Review notes (author)
- **Spec coverage:** provider seam + mock catalog + pricing (T1), schema/helpers (T2), practitioner APIs incl. server-recomputed totals (T3), public pay + attribution via `recordOrder` (T4), practitioner UI + nav (T5), branded pay page + chrome hide (T6), suite/build/demo (T7). All spec sections map to a task.
- **Server-trust:** T3 rebuilds line items from the catalog and ignores client prices (asserted in `api-carts` test). T4 attribution is idempotent (order_id `cart-<id>` unique + `markCartPaid` guarded on `status != 'paid'`).
- **Swap-readiness:** only `getCatalog`/`createDraftOrder` in `lib/commerce/index.ts` change for Shopify; nothing else references Shopify.
- **Type consistency:** `CatalogProduct`/`Product`, `PatientCart`/`Cart`/`CartView`, and the `{cart, payUrl}` create response are consistent across tasks. Verify `getPractitioner`, `sessionCookieHeader`, `getServerSessionPractitioner`, and the orders read-back helper names against `lib/db.ts` during T2–T4 (noted inline where used).
