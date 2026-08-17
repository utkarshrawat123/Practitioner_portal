# Cloudflare local development

This app runs on Cloudflare Workers (via [OpenNext](https://opennext.js.org/cloudflare))
using **D1** (database) and **R2** (file storage). You can build and run the whole
thing **locally with no Cloudflare account and no keys** — Wrangler emulates D1 and
R2 on your machine.

## Two ways to run locally

| Command | Runtime | Bindings |
|---|---|---|
| `npm run dev` | Node (Next dev server, port 3100) | None → DB falls back to a local SQLite `file:`, storage to `data/uploads/`, email to mock. This is the everyday dev loop. |
| `npm run preview:cf` | Cloudflare Workers (Wrangler, port 8787) | Local **D1** + **R2** emulation. Use this to exercise the real Cloudflare code paths. |

## `npm run preview:cf` details

1. Runs `opennextjs-cloudflare build` → emits `.open-next/worker.js`.
2. Starts `wrangler dev` at http://localhost:8787 with **local** D1 and R2
   (stored under `.wrangler/state/`). No login required — everything is emulated.
3. On first request the app **self-migrates** the local D1: `getClient()` runs the
   base `SCHEMA` + `lib/migrations.ts`, exactly as it does on Turso/file. No manual
   migration step is needed.

## Notes

- **No account needed to build or preview.** Real Cloudflare credentials are only
  required for a production deploy — see `docs/CLOUDFLARE_GO_LIVE.md`.
- The D1 binding is `DB`; the R2 binding is `BUCKET` (see `wrangler.toml`).
- Tests (`npm test`) always run on the Node/file path and never touch Cloudflare.
- To reset local D1/R2 state, delete the `.wrangler/state/` directory.
