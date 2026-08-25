# Local test drive — run the whole thing as if it were live

Everything below runs on this machine with **no company credentials**. It is the closest
you can get to the live experience before IT provides keys.

Node is not on PATH in tool shells. Every terminal starts with:

```bash
export PATH="/c/Users/UtkarshRawat/AppData/Local/node/node-v22.20.0-win-x64:$PATH"
```

---

## 1. Which server to run

| Command | Port | Use it for |
|---|---|---|
| `npm run dev` | 3100 | Fast iteration. Node runtime, hot reload. **Not** the production runtime. |
| `npm run preview:cf` | 8787 | **Use this to judge the app.** Real `workerd` + local D1 + local R2 — the same runtime Cloudflare will execute. |

**Judge the app on :8787.** `npm run dev` uses a different runtime and different storage, so
it can hide Workers-only problems.

> **Never run both a dev server and a build at once** — `npm run build` corrupts `.next` if
> a dev server is live. Symptom: `Cannot find module './1331.js'`. Fix: stop dev,
> `rm -rf .next`, restart.

---

## 2. Signing in

### As a practitioner

1. Open `http://localhost:8787/dashboard`
2. Enter a seeded email — **`sarah.whitfield@example.com`** (has referrals + paid carts, so
   the dashboard has real numbers on it)
3. **No email is sent.** With no Resend key, the magic link appears **on screen**. Click it.

Other seeded practitioners exist, including two deliberately **flagged** for the admin
review queue, so you can exercise the approval flow.

### As an admin

1. Open `http://localhost:8787/admin`
2. Password: **`preview-admin`**

The admin console is a full-takeover route — no practitioner sidebar, by design.

---

## 3. What to click, and how the two halves connect

The point of this pass is that admin actions show up on the practitioner side. Try these
round trips:

| Do this in `/admin` | Then look here |
|---|---|
| Practitioners → approve a flagged applicant | That practitioner can now sign in |
| Lessons → publish a lesson | `/library`, and the Dashboard's learning count |
| Toolkit → add a resource | `/toolkit` |
| Media → upload a file | `/resources` (stored in local R2) |
| Pathways → build a pathway with modules | `/learning`, then `/cpd` after completion |
| Events → create an event | `/events`; registering emits an `.ics` |
| Community → pin or hide a post | `/community` |
| Widgets → add a homepage widget | Dashboard "What's New" |
| Pearls → add a clinical pearl | Dashboard |
| Referrals → approve a referral | `/referrals` and `/leaderboard` |
| Live Chat → reply to a practitioner | The chat widget, bottom-right |

### The practitioner sidebar

Grouped to the design deck's pillars. Every practitioner route is reachable from it —
a test enforces this, so nothing can end up orphaned behind a dashboard tile:

- **(top)** Dashboard
- **Learn** — Learning Pathways · Lessons · My CPD
- **My Clinic** — Clinical Toolkit · Resources · Ask the Expert
- **Connect** — Community · Events
- **Practice Growth** — Patient Carts · Refer & Earn · Leaderboard

---

## 4. What is genuinely live locally, and what is mocked

This is the honest map. Anything "mock" is **not broken** — it is the mock-until-keyed
design, and it flips to live the moment a key exists.

| Area | Local state |
|---|---|
| Database (D1) | **Live** — real local D1 in `.wrangler/state`, self-migrating, seeded |
| File storage (R2) | **Live** — real local R2 emulation; uploads work |
| Sessions, magic links, admin auth | **Live** — real signed cookies |
| Practitioner + admin UI, all routes | **Live** |
| Contact details | **Live** — `SUPPORT_EMAIL` is set, so every contact surface is populated |
| Email delivery | **Mock** — no Resend key, so magic links render on screen instead of sending |
| AI (Ask the Expert, Content Factory, chat FAQ) | **Mock** — no Gemini key, and the existing keys are quota-exhausted |
| Shopify catalogue, carts, orders | **Mock** — mock catalogue and mock pay page |
| Error monitoring (Sentry) | **Mock** — errors go to the console |
| Facebook group link | **Hidden** — the real URL is unknown, so nothing is shown rather than a wrong link |

---

## 5. Readiness: what it will say locally, and why

Open `/api/admin/readiness` while signed in as admin.

Locally it reports **`ready: false`**, and that is **correct** — it is a *go-live* check, not
a local one. Expect exactly these:

- `email`, `ai` → **mock** — no keys. Expected.
- `r2_public_base` → **missing** — media is served through the auth-gated `/api/files`
  route locally instead of a public R2 URL. Expected.
- `d1_id` → **missing** — this only confirms `wrangler.toml` no longer ships
  `PLACEHOLDER_D1_ID`. Meaningless locally. Expected.
- A **localhost `PORTAL_URL` warning** — correct and deliberate: it is telling you this
  instance's links would not work for a real practitioner.
- `support_email` → **live**, because it is now configured.

On launch day the target is `ready: true` **and an empty `warnings` array**. See
`docs/CLOUDFLARE_GO_LIVE.md` §5c.

---

## 6. Full automated sweep

To re-check every page and API at once — signs in as a practitioner via the real
magic-link flow, walks every route, then verifies admin auth is actually enforced:

```bash
node scripts/smoke-local.mjs
```

Point it at the dev server instead with `BASE=http://localhost:3100 node scripts/smoke-local.mjs`.

---

## 7. Resetting

```bash
# wipe local data and reseed from scratch
# (stop the servers first)
rm -rf .wrangler/state
npm run preview:cf
```

If `rm -rf .open-next` fails with `EBUSY`, a `workerd`/`wrangler` process is still alive.
Kill every `workerd.exe` and `node.exe` first, then remove it.
