# Cloudflare go-live checklist

Everything is built and runs locally in mock mode with **no keys**. This is the
short, do-it-once list to make it live on Cloudflare when you have account access.
Steps 1–5 are all done in the **browser** (Cloudflare dashboard) — no software to
install on the machine you deploy from.

## 0. Prerequisites
- A Cloudflare account (work account).
- The work repo `utkarshrawat123/Practitioner_portal` connected to it (step 4).

## 1. Create the resources (Cloudflare dashboard)
1. **D1 database** → name it `practitioner-portal`. Copy its **database ID**.
2. **R2 bucket** → name it `practitioner-portal-media`. Enable **public access**
   and copy the bucket's **public URL** (e.g. `https://pub-xxxx.r2.dev`).

## 2. Fill in `wrangler.toml`
- Set `[[d1_databases]].database_id` to the ID from step 1 (replaces
  `PLACEHOLDER_D1_ID`).
- The R2 binding name already matches; no change needed unless you renamed it.

## 3. Set secrets
In the dashboard (Workers → your Worker → Settings → Variables), or via
`npx wrangler secret put <NAME>`:

| Secret | Purpose |
|---|---|
| `RESEND_API_KEY` | Transactional email (replaces Gmail SMTP, which can't run on Workers) |
| `EMAIL_FROM` | Verified Resend sender, e.g. `Wild Nutrition <hello@yourdomain>` |
| `GEMINI_API_KEY`, `GEMINI_API_KEY2` | Ask-the-Expert + Content Factory |
| `ANTHROPIC_API_KEY` | Optional: legacy AI fallback + lesson generation |
| `ADMIN_PASSWORD` | `/admin` login |
| `SESSION_SECRET` | Practitioner session signing |
| `CRON_SECRET` | Authorises the scheduled cron calls |
| `R2_PUBLIC_BASE` | The R2 public URL from step 1 (used for media URLs) |
| `PORTAL_URL` | Your live URL (also used by cron self-calls) — set in `[vars]` or as a secret |

**Shopify (set whenever the store credentials arrive — independent of the rest):**

| Secret | Purpose |
|---|---|
| `SHOPIFY_STORE_DOMAIN` | e.g. `your-store.myshopify.com` — with `SHOPIFY_ADMIN_TOKEN`, flips `commerceProvider()` to `'shopify'` |
| `SHOPIFY_ADMIN_TOKEN` | Admin API access token (scopes below) |
| `SHOPIFY_WEBHOOK_SECRET` | HMAC secret verifying `/api/webhooks/shopify` |
| `AFFILIATE_DISCOUNT_PERCENT` | Optional; patient/referral discount % (default 10) |
| `STATS_SOURCE` | Optional; `shopify-live` queries the Admin API directly instead of the local `orders` table (reconciliation) |

Admin API **scopes** to request for the token: `write_discounts` (referral discount codes),
`read_orders` (live stats query), `read_products` + `write_draft_orders` (Patient Carts once
the shopify branch of `getCatalog()`/`createDraftOrder()` is implemented — see `HANDOVER.md` §13).
Also register **`orders/create` + `orders/paid` webhooks** on the store pointing at
`https://<your-portal>/api/webhooks/shopify`, signed with `SHOPIFY_WEBHOOK_SECRET`.

**Not needed on Cloudflare** (replaced): `TURSO_*`, `BLOB_READ_WRITE_TOKEN`,
`GMAIL_USER`, `GMAIL_APP_PASSWORD`, all `VERCEL_*`.

## 4. Connect the repo for git-based deploys (browser only)
- Cloudflare dashboard → Workers & Pages → **Create → Workers → Connect to Git**.
- Pick `utkarshrawat123/Practitioner_portal`, branch **`cloudflare-migration`** (the default branch —
  `main` is the pre-migration Vercel app and must NOT be deployed).
- **Build command:** `npx opennextjs-cloudflare build`
- **Deploy command:** `npx wrangler deploy` (entry is `worker.ts` per `wrangler.toml`).
- Every push now builds and deploys automatically — nothing to install locally.

## 5. First deploy details
- **Database schema:** the app self-migrates on the first request — `getClient()`
  runs the base schema + `lib/migrations.ts` against D1 automatically (same as it
  does on Turso). No manual migration step. (Optional: `wrangler d1 execute
  practitioner-portal --command "SELECT 1"` to confirm connectivity.)
- **Cron:** the two triggers in `wrangler.toml` (`0 6` daily automation, `0 7`
  chat alerts) activate on deploy; `worker.ts`'s `scheduled()` calls the routes
  with `CRON_SECRET`.

## 6. Smoke test
1. Open the site → `/apply` submits and a practitioner appears in `/admin`.
2. `/admin` login with `ADMIN_PASSWORD`.
3. Admin → Media → upload a file → it stores in R2 and renders (public URL).
4. A student application's certification opens via `/api/files/certifications/…`
   only when admin-authed (401 otherwise).
5. Email: with `RESEND_API_KEY` + `EMAIL_FROM` set, a welcome/magic-link email
   sends via Resend.

## Maintenance notes
- **Knowledge base:** the AI assistant loads `knowledge/*.md` from a build-time
  bundle on Workers. If you edit anything under `knowledge/`, re-run
  `npm run bundle-kb` and commit `lib/ai/kb.bundle.json`.
- **Local Cloudflare preview:** `npm run preview:cf` runs the Worker with local
  D1 + R2 emulation (no account needed) — see `docs/CLOUDFLARE_DEV.md`.
- **Everyday dev:** `npm run dev` (port 3100) still uses the Node/file path.
