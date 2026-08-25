# Pick up here — session handover (2026-08-25)

Read `HANDOVER.md` first for the app itself. **This file is only "where we are right
now and what to do next."**

---

## 1. State in one block

```
repo     https://github.com/utkarshrawat123/Practitioner_portal
default  cloudflare-migration   @ 2e33944   (all feature work merged)
open     feat/brand-ui-redesign @ 326a09b   (pushed, NOT merged — the UI reskin)
local    C:\Users\UtkarshRawat\Projects\practitioner-portal
tests    437 passing / 97 files
build    clean
deploy   NOT deployed — no company credentials yet
```

**Everything runs locally with zero credentials.** Mock-until-keyed is the hard rule.

### Environment on this machine (Windows only — no Mac, no admin rights)

Node is **not on PATH** inside tool shells. Export it first, every time:

```bash
export PATH="/c/Users/UtkarshRawat/AppData/Local/node/node-v22.20.0-win-x64:$PATH"
```

```bash
npm install
cp .env.example .env.local     # already present locally; gitignored
npm test                        # 437
npm run dev                     # :3100
npm run preview:cf              # :8787 — real workerd + local D1/R2
npm run build                   # STOP the dev server first (see §5)
```

Local admin password: **`preview-admin`**. Practitioner sign-in: `/dashboard` → enter a
seeded email → the magic link appears **on screen** (no email provider configured).
Seeded accounts include `sarah.whitfield@example.com` (has referral + paid carts).

---

## 2. What this session did (9 branches, 359 → 437 tests)

All merged into `cloudflare-migration` except the last:

| Commit | What |
|---|---|
| `3e4d876` | **Windows test teardown** — `npm test` reported 169 phantom `EBUSY` failures; a `setupFiles` shim retries temp-dir removal, scoped to lock codes under `os.tmpdir()`. Made the suite usable here. |
| `25af5bf` | **KB tooling** — dossier contract validator, bundle-drift guard, positive `Clinical review:` marker replacing the self-defeating SAMPLE banner |
| `1b6a0b1` | **Docs de-Vercel'd** — HANDOVER/CLAUDE/LAUNCH_CHECKLIST rewritten to Cloudflare truth; deleted dead `vercel.json` |
| `83fa3f3` | **Go-live doc** — added the missing Shopify secrets + API scopes; fixed deploy branch (`main` → `cloudflare-migration`) |
| `3c28bf3` | **`preview:cf` fixed on Windows** — `outputFileTracingIncludes` for `@libsql/**`. **Do not remove that block.** |
| `cbcc371` | **Shopify connect** — real `getCatalog()`/`createDraftOrder()` + webhook cart reconciliation via `wn_cart_token`; +5 KB dossiers |
| `b927a4c` | **Polish** — CartsApp surfaces errors, `formatMoney()`, `*/5` chat cron |
| `badc2af` | **Sentry seam** — `lib/monitoring.ts`, wired into `worker.ts` fetch + scheduled |
| `f5ddc41` | **Referral v2** — paid-only credit, refund clawback, per-referrer cap, optional admin approval (migration `018`) |
| `bdf8f16` | **Go-live readiness** — missing-D1 guard + `GET /api/admin/readiness` |
| `2e33944` | **Local dev works from a fresh clone** — `.env.example` rewritten, dev-doc corrected |
| `326a09b` | **Brand UI redesign** (unmerged) — see `docs/UI_REDESIGN.md` |

---

## 3. Where to pick up

### The conversation the user wants next
**Remaining features vs the design deck.** Read **`docs/DECK_GAP_ANALYSIS.md`** — it
maps the deck's 3-phase roadmap against what exists, and flags the two things that
need a *product decision* rather than code:

1. **"Ask Lorna" is not the built "Ask the Expert."** The deck wants an intelligent
   *search* over the clinical library returning mixed result cards. What exists is an
   AI *protocol generator*. Different feature — don't assume it's done.
2. **Patient Carts / Referrals / Leaderboard are built but absent from the deck**,
   while the deck's nav shows *Practice Growth* and *My Patients/My Clinic*. Someone
   must decide whether those are renames of existing features or new scope. **Blocks
   any nav restructuring.**

Suggested build order is in that doc §6 (saved resources → global search → Ask Lorna →
events tabs → consultation booking).

### The in-flight work
**`feat/brand-ui-redesign`** — foundation + shell + Dashboard done; ~42 components
still on old layout patterns. `docs/UI_REDESIGN.md` has the tokens, the primitives, and
four open design questions. **Get sign-off on the Dashboard before restyling the rest**
— and especially confirm whether Fraunces is an acceptable stand-in for Gestura, since
changing it later is expensive.

---

## 4. Blocked on other people (no code possible)

| Item | Blocker |
|---|---|
| Go-live (Track A) | IT: Cloudflare account + D1/R2, Resend key + **domain-verified** sender, Gemini key with billing, Shopify Admin token + webhook secret. Then `docs/CLOUDFLARE_GO_LIVE.md`, ~30 min, config only. |
| AI features (Ask the Expert, Content Factory, chat FAQ) | Gemini keys are **429 quota-exhausted**. Config only. |
| KB clinical content | All **12** `knowledge/` dossiers are `AWAITING APPROVAL` drafts. `docsAwaitingClinicalApproval()` must be empty before the assistant is used with real practitioners — enforced by test. |
| Shopify end-to-end proof | Code is done but only stubbed-fetch tested. **A Shopify partner dev store is free and self-serve** — doesn't need IT. First real draft order validates `wn_cart_token` → `note_attributes` reconciliation, which is the one assumption I could not verify. |
| Real-device mobile pass | Only checked at 375px in devtools |
| Brand fonts + photography | Licensed/unavailable; substitutes in place |
| Referral email invites | Deliberately not built — consent/GDPR call for the business |

---

## 5. Gotchas that cost time this session

1. **`npm run build` corrupts `.next` if a dev server is running.** I hit this: the app
   started 500ing with `Cannot find module './1331.js'`. Fix: kill dev, `rm -rf .next`,
   restart. Documented but easy to forget.
2. **`preview:cf` needs `outputFileTracingIncludes`** in `next.config.mjs`. Next's
   tracer only follows the `node` export condition, so `@libsql`'s workerd-condition
   files (`lib-esm/web.js`, hrana `*/proto.js`) went untraced; on Windows OpenNext
   *copies* traces (macOS links), so esbuild failed with 97 × `Could not resolve`.
3. **`rm -rf .open-next` fails with "Device or resource busy"** when a `workerd`/
   `wrangler` process is still alive. Kill it first.
4. **`.dev.vars`** (gitignored) supplies secrets to `wrangler dev` — that's how to
   exercise keyed paths locally (used it to verify the signed Shopify webhook and the
   referral clawback).
5. **Windows CRLF + the KB bundle** — `knowledge/**` and `kb.bundle.json` are pinned to
   LF in `.gitattributes`, and the loader/bundler normalise. Don't undo it.
6. **Bash→Node path mangling:** passing a `/c/Users/...` path into `node -e` becomes
   `C:\c\Users\...`. Run node from the target directory or use `C:/...` form.
7. **Docs drift is real** — I had to correct stale claims *twice in one session*,
   including docs I'd just written. Re-check `HANDOVER.md` §13 and test counts after
   finishing any chunk of work.

---

## 6. Local demo data

The local D1 (`.wrangler/state/`, shared between `dev` and `preview:cf`) is seeded:
8 practitioners (2 deliberately **flagged** for the admin review queue), 4 lessons,
3 media, 2 pathways with modules, 4 toolkit items, 3 events, 3 pearls, 3 widgets,
3 community posts, 3 carts (2 paid), 1 **credited £50 referral**.

Wipe with: stop servers → delete `.wrangler/state/` → restart (schema self-migrates).

---

## 7. Standing conventions (do not violate)

- **TDD** — failing test first. Two gates before "done": `npm test` + `npm run build`.
  Anything touching D1/R2/cron/routes **also** needs `npm run preview:cf` (it works on
  Windows now).
- **Mock-until-keyed is sacred** — no feature may hard-require a key to boot.
- Edited `knowledge/`? → `npm run bundle-kb` and commit `lib/ai/kb.bundle.json`.
- Adding a cron schedule? → edit **both** `wrangler.toml [triggers]` **and**
  `lib/cron/map.ts`.
- Never reference `care@wildnutrition.com`.
- Never touch `Utkarshraw123/practitioner-portal` (separate personal portfolio repo).
- Small branches off `cloudflare-migration`, each ending green.
