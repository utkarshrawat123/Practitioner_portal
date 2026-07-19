# Patient Carts — practitioner-curated cart → pay link (design)

**Date:** 2026-07-19
**Status:** Approved design, ready for implementation plan.
**Purpose:** A demo-ready feature for an executive presentation: a practitioner builds a
curated cart for a patient and hands over a link to pay for exactly those items; the sale is
attributed to the practitioner (commission) and shows up in the existing Reporting revenue.
Runs entirely on a **mock commerce provider** (no Shopify needed) and is built Shopify-shaped so
the real integration is a drop-in swap once approved.

---

## 1. Goal & scope

**In scope**
- A new practitioner-facing section to build a cart (curated products + quantities) for a named patient.
- A tokenized, login-free, Wild-Nutrition-branded patient **pay page** with a clearly-labelled demo
  card form that simulates payment.
- On payment: attribute the sale to the practitioner (reusing the existing `recordOrder` pipeline) so
  it flows into the existing dashboard/Reporting revenue automatically, and compute the practitioner's commission.
- A **commerce provider seam** (`mock` today, `shopify` later) selected by whether Shopify creds exist.
- Copy-link and "Send to patient" email (via the existing Gmail SMTP) delivery.
- A mock catalog of real Wild Nutrition products with real public product images.

**Out of scope (deferred to the real Shopify swap)**
- Real payment processing, PCI handling, real card capture (the demo form never stores or transmits card data).
- Shipping, VAT/tax calculation, inventory/stock checks.
- An admin "all carts" overview (the flow already surfaces in Reporting; can be added later).
- Patient accounts/login (the pay link is public + tokenized, like the existing cert-upload link).

**Pricing shown in the demo**
- Patient gets a discount (`AFFILIATE_DISCOUNT_PERCENT`, demo default **10%**).
- Practitioner earns commission (`COMMISSION_PERCENT`, already **20%**) on the paid total.
- `subtotal` = Σ(unit_price × qty); `discount_amount` = round(subtotal × discount%); `total` = subtotal − discount_amount;
  `commission_amount` = round(total × 20%).

---

## 2. Architecture — the provider seam (the swap point)

A small `lib/commerce/` module with a provider selected at call time, mirroring the existing
`selectProvider()` pattern in `lib/ai/assistant.ts`:

```
commerceProvider(): 'shopify' | 'mock'
  → 'shopify' when SHOPIFY_STORE_DOMAIN && SHOPIFY_ADMIN_TOKEN are set, else 'mock' (always mock for the demo)
```

Interface (`lib/commerce/types.ts`):
- `CatalogProduct { id: string; title: string; imageUrl: string; price: number; currency: 'GBP' }`
- `getCatalog(): Promise<CatalogProduct[]>`
  - **mock:** returns the curated list from `lib/commerce/catalog.mock.ts`.
  - **shopify (future):** Shopify products/variants via the Storefront/Admin API.
- `createDraftOrder(input): Promise<{ externalId: string; payUrl: string }>`
  - **mock:** persists the cart locally and returns our own `/pay/{token}` URL (`externalId` = `mock-cart`).
  - **shopify (future):** creates a draft order (Admin API), returns its `invoice_url` as `payUrl` and the draft id.

Only these implementations differ between demo and production. The DB model, practitioner UI, and
patient page are identical in both.

---

## 3. Data model (migration 016)

```sql
CREATE TABLE IF NOT EXISTS patient_carts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  patient_name TEXT NOT NULL,
  patient_email TEXT,
  token TEXT NOT NULL UNIQUE,                 -- opaque random; the public pay-link id
  status TEXT NOT NULL DEFAULT 'draft',       -- draft | sent | paid
  currency TEXT NOT NULL DEFAULT 'GBP',
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  commission_amount REAL NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'mock',
  external_id TEXT,                            -- Shopify draft order id later; 'mock-cart' now
  pay_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_patient_carts_practitioner ON patient_carts(practitioner_id);
CREATE TABLE IF NOT EXISTS patient_cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id INTEGER NOT NULL REFERENCES patient_carts(id),
  product_ref TEXT NOT NULL,                   -- catalog product id
  title TEXT NOT NULL,
  image_url TEXT,
  unit_price REAL NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_patient_cart_items_cart ON patient_cart_items(cart_id);
```

**Token:** an opaque unguessable random string (`crypto.randomBytes(24).toString('hex')`) stored on the
row — simplest secure public-link pattern (revocable, no secret math needed). The patient URL is
`/pay/{token}`; lookup is by `token`.

**DB helpers (lib/db.ts):** `createPatientCart`, `listPatientCartsForPractitioner`, `getCartByToken`
(joins items), `markCartSent`, `markCartPaid` (idempotent), plus `PatientCart` / `PatientCartItem` types.

---

## 4. APIs

Practitioner (session-gated, `getSessionPractitioner` + approved):
- `GET  /api/me/catalog` → `{ products: CatalogProduct[] }` (from the commerce provider).
- `POST /api/me/carts` `{ patientName, patientEmail?, items: [{ productRef, qty }] }` → validates against the
  catalog (server recomputes prices/totals — never trusts client prices), calls `createDraftOrder`, persists
  the cart + items, returns `{ cart, payUrl }`. `201`.
- `GET  /api/me/carts` → `{ carts }` (the practitioner's own carts, newest first).
- `POST /api/me/carts/[id]/send` → emails the patient the pay link (Gmail SMTP), sets `status='sent'`, `sent_at`.
  Guarded so a practitioner can only send their own cart.

Public (no login — token is the credential):
- `GET  /api/pay/[token]` → `{ practitionerName, patientName, items, subtotal, discount, total, status }`.
- `POST /api/pay/[token]` → marks the cart paid (mock): sets `status='paid'`, `paid_at`, and calls
  `recordOrder({ orderId: 'cart-<id>', practitionerId, code: <practitioner affiliateCode>, total, currency,
  financialStatus: 'paid', createdAt })` so the sale enters the existing revenue/reporting pipeline.
  **Idempotent** — a cart already `paid` returns success without double-recording (order_id is UNIQUE anyway).
  The request body carries NO card data that is persisted; any demo card fields are ignored server-side.

All route files: `export const dynamic = 'force-dynamic'`.

---

## 5. Practitioner UI

- **Nav + route:** add "Patient Carts" to the practitioner site nav (`components/SiteHeader.tsx`) and a
  dashboard quick-link; new route `app/carts/page.tsx` (server shell → client `components/CartsApp.tsx`).
- **Build flow (CartsApp):**
  1. Patient name (required) + email (optional).
  2. Product grid from `/api/me/catalog` — click to add, adjust quantity.
  3. Live summary: subtotal, patient discount (10%), total, and **"You earn £X commission."**
  4. "Create pay link" → `POST /api/me/carts` → shows the link with **Copy** and **Send to patient**
     (the latter calls the send endpoint and shows "Sent to {email}").
  5. Below: the practitioner's carts list with status chip (Draft/Sent/Paid), total, commission, patient name.
- Brand tokens/idioms match the rest of the portal (ink/terracotta/cream/sage/stone/forest, uppercase tracking labels).

---

## 6. Patient pay page — `/pay/[token]` (public, branded)

- Route `app/pay/[token]/page.tsx` (server shell reads token → client `components/PayPage.tsx`). Add `/pay`
  to `ChromeGate`'s hidden routes so the practitioner site header/footer don't show; the page has its own
  minimal Wild-Nutrition-branded header.
- Content: "Hi {patientName}, {practitionerName} has prepared this for you." → line items (image, title, qty,
  price) → subtotal, discount, total.
- A **clearly-labelled demo** card form (cardholder, number pre-filled `4242 4242 4242 4242`, expiry, CVC) with
  a visible "Demo checkout — no real payment is taken" note. Card fields are never stored or sent to any real
  processor; the POST ignores them.
- "Pay £{total}" → `POST /api/pay/[token]` → success screen ("Payment successful — thank you"). If the cart is
  already paid, show the paid/receipt state instead of the form.

---

## 7. Attribution & the "money shot"

On payment the mock does exactly what the real Shopify webhook will do: `recordOrder(...)` against the
practitioner (matched by their existing `affiliateCode`). Because dashboard + Reporting already read from the
`orders` table, the new revenue and the practitioner's contribution appear with **no changes to Reporting**.
Demo arc: practitioner builds cart → sends link → patient pays on the branded page → admin Reporting revenue
ticks up. (When Shopify is connected, the same arc runs through a real draft-order invoice + the real webhook.)

---

## 8. Mock catalog

`lib/commerce/catalog.mock.ts`: ~8 real Wild Nutrition products (title, real public product image URL, GBP price).
Real image URLs are captured at build time from wildnutrition.com (Shopify CDN images are hotlinkable); if any
URL fails to load, bundle those images under `public/catalog/` as a fallback. Prices use realistic WN values.

---

## 9. Future: the Shopify swap (no schema/UI change)

When `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` (+ `SHOPIFY_WEBHOOK_SECRET`) are set:
1. Implement the `shopify` branch of `getCatalog` (products API) and `createDraftOrder` (Admin API draft order →
   `invoice_url`), attaching the practitioner's discount code and `note_attributes.practitioner_id` for attribution.
2. Point `pay_url` to the Shopify `invoice_url`; retire our `/pay` page for real orders (or keep as a fallback).
3. Extend the existing `/api/webhooks/shopify` to also read `note_attributes.practitioner_id` and reconcile the
   `patient_carts` row to `paid` by `external_id`.
No changes to `patient_carts`, the practitioner UI, or Reporting.

---

## 10. Testing (follow existing patterns; keep the suite green)

- **`tests/commerce-mock.test.ts`** — `getCatalog` returns products with positive prices; `commerceProvider()`
  is `mock` without Shopify env.
- **`tests/patient-carts-db.test.ts`** — create cart + items; totals/commission math; `getCartByToken` returns
  items; `markCartPaid` is idempotent and sets `paid_at`.
- **`tests/api-carts.test.ts`** — `POST /api/me/carts` 401 unauth; happy path recomputes totals server-side and
  ignores client-sent prices; `GET /api/me/carts` returns only the caller's carts; `/api/me/carts/[id]/send`
  can't touch another practitioner's cart.
- **`tests/api-pay.test.ts`** — `GET /api/pay/[token]` 404 on bad token, returns cart on good token; `POST`
  marks paid AND records an order for the practitioner; second POST is idempotent (no double order).

---

## 11. Files

**New:** `lib/commerce/{types,index,catalog.mock}.ts`, `app/api/me/catalog/route.ts`,
`app/api/me/carts/route.ts`, `app/api/me/carts/[id]/send/route.ts`, `app/api/pay/[token]/route.ts`,
`app/carts/page.tsx`, `components/CartsApp.tsx`, `app/pay/[token]/page.tsx`, `components/PayPage.tsx`,
tests above, this spec.
**Edited:** `lib/migrations.ts` (016), `lib/db.ts` (types + cart helpers), `components/SiteHeader.tsx` (nav link),
`components/ChromeGate.tsx` (hide chrome on `/pay`), optionally `components/DashboardApp.tsx` (quick-link).

---

## 12. Deployment / env
- No new npm dependencies. No new required env vars for the demo (mock is the default).
- Optional demo tuning: `AFFILIATE_DISCOUNT_PERCENT` (default 10), `COMMISSION_PERCENT` (already 20).
- Migration 016 runs automatically on first DB connection. Deploy via `npx vercel --prod --yes`.
- Everything works with zero Shopify configuration; the swap in §9 lights up production commerce later.
