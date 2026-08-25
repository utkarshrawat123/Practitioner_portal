# Local development

This app runs on Cloudflare Workers (via [OpenNext](https://opennext.js.org/cloudflare))
using **D1** (database) and **R2** (file storage). **You can build and run the whole
thing locally with no Cloudflare account and no API keys** — Wrangler emulates D1 and
R2 on your machine, and every external integration runs in mock mode until its key
is present.

## First-time setup (30 seconds)

```bash
npm install
cp .env.example .env.local     # gitignored; no real credentials needed
npm test                       # expect all green
npm run dev                    # http://localhost:3100
```

`.env.local` only needs the three uncommented values in `.env.example`
(`ADMIN_PASSWORD`, `SESSION_SECRET`, `PORTAL_URL`). **Without `ADMIN_PASSWORD` the
`/admin` login returns 401 no matter what you type**, which is the usual "why can't I
get into admin locally" answer.

## Two ways to run

| Command | Runtime | Bindings | Catches |
|---|---|---|---|
| `npm run dev` | Node (Next dev server, **:3100**) | **Real local D1 + R2**, via `initOpenNextCloudflareForDev()` in `next.config.mjs` | Everyday work. Fast refresh. Exercises the actual D1 SQL path. |
| `npm run preview:cf` | **workerd** (Wrangler, **:8787**) | Same local D1 + R2 | Bundling, Workers-runtime limits, `worker.ts` entry, cron triggers. |

Both share the **same** local D1 state under `.wrangler/state/`, so data you create in
`npm run dev` is visible in `npm run preview:cf` and vice versa. On first request the
app self-migrates: `getClient()` runs the base `SCHEMA` + `lib/migrations.ts`, exactly
as it will against real D1.

Neither uses `data/practitioners.db` — that libSQL file path only applies when no D1
binding exists (notably the test suite, which sets `DB_PATH`). This is why
`npm run preview:cf` is still a required gate for runtime work: unit tests run the
file path, not D1.

Reset all local state by deleting `.wrangler/state/`.

## Getting a session locally

- **Admin:** `POST /api/admin/login` with `{"password": "<ADMIN_PASSWORD>"}`, or just use
  the form at `/admin`.
- **Practitioner:** apply as a qualified BANT applicant — `POST /api/apply` auto-approves
  and sets the session cookie in the response. Or `POST /api/auth/request-link` and open
  the **`devLink`** it returns (with no email provider configured the magic link comes
  back on screen instead of being emailed).
- Dismiss the welcome takeover with `POST /api/me/seen-welcome`.

## What works locally, and what degrades

| Area | Without any keys |
|---|---|
| Database, all CRUD, migrations | **Full** (local D1) |
| Onboarding, approval, register verification | **Full** |
| Patient carts, pay page, order attribution, referrals (incl. clawback) | **Full** (mock commerce) |
| Media/file upload, certificates | **Full** (R2 emulation; private files via `/api/files/...`) |
| Community, events, lessons, toolkit, CPD, leaderboard, chat, presence | **Full** |
| Admin console (16 sections) | **Full**, once `ADMIN_PASSWORD` is set |
| Magic-link email | Returns `devLink` on screen instead of sending |
| Ask the Expert / Content Factory / chat FAQ clustering | `503 not_configured` by design — needs `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` |
| Real Shopify catalog/draft orders | Mock catalog + mock pay page until store creds are set |
| Shopify order webhook | `401` on every call until `SHOPIFY_WEBHOOK_SECRET` is set |
| Error monitoring | Console only until `SENTRY_DSN` is set |

To exercise a **keyed** path locally, put the value in **`.dev.vars`** (gitignored) —
Wrangler loads it for `wrangler dev`. That is how to test, say, the signed Shopify
webhook without touching production.

## Cron jobs

Schedules live in `wrangler.toml [triggers]` and map to routes in `lib/cron/map.ts`
(**adding one means editing both**). Fire one on demand:

```bash
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"
```

## Notes

- **No Cloudflare account is needed** to build, run or preview. Real credentials are
  only for a production deploy — see `docs/CLOUDFLARE_GO_LIVE.md`.
- Bindings: D1 is `DB`, R2 is `BUCKET` (see `wrangler.toml`).
- `npm run build` corrupts `.next` if a dev server is running — stop it first.
- Editing anything under `knowledge/` requires `npm run bundle-kb` (see
  `docs/KB_AUTHORING.md`).
- **Windows:** `preview:cf` works, but depends on the `outputFileTracingIncludes` block
  in `next.config.mjs` — don't remove it. If `rm -rf .open-next` reports "Device or
  resource busy", a `workerd`/`wrangler` process is still holding it; kill it first.
