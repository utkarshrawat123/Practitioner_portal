# Pick up here — session handover (updated 2026-08-27, session 3)

Read `HANDOVER.md` for the app itself. **This file is only "where we are right now and
what to do next."** It supersedes the session-2 version of this file entirely.

---

## 1. State in one block

```
repo     https://github.com/utkarshrawat123/Practitioner_portal
default  cloudflare-migration @ cae122d   (all work merged; 1 commit ahead of origin — PUSH IT)
local    C:\Users\UtkarshRawat\Projects\practitioner-portal
tests    520 passing / 111 files
build    clean
smoke    57/57
deploy   NOT deployed — still waiting on company credentials
```

**No unmerged branches.** 52 commits landed this session (`2e33944..cae122d`).

> ⚠️ **First thing to do:** `git push origin cloudflare-migration` — HEAD is one commit
> ahead of origin (the admin shell restyle). Everything before it is pushed.

### Running it — the easy way

**Double-click `start-portal.cmd`** in the project root. It cds to the project, kills a
stale worker, puts node on PATH, and starts the Cloudflare preview on `:8787`. It prints
the sign-in details while it builds.

```
start-portal.cmd          -> real Cloudflare runtime, :8787, ~3 min build
start-portal.cmd dev      -> fast Node dev server,    :3100, seconds
```

Sign in: `http://localhost:8787/dashboard` → `sarah.whitfield@example.com` → the magic
link appears **on screen**. Admin: `/admin`, password `preview-admin`.

In tool shells node is not on PATH; export first:
`export PATH="/c/Users/UtkarshRawat/AppData/Local/node/node-v22.20.0-win-x64:$PATH"`

---

## 2. What shipped this session

### Features

| Thing | Where |
|---|---|
| **Go-live hardening** — contact details behind `SUPPORT_EMAIL`, readiness catches "present but wrong" config | `lib/support.ts`, `lib/readiness.ts` |
| **Nav regroup** — sidebar grouped to the deck pillars; every route reachable | `lib/nav.ts`, `components/SideNav.tsx` |
| **Full brand reskin** — all practitioner pages + all 17 admin components | everywhere |
| **Saved items / "My Clinic"** — save toolkit/resources/lessons, one page | migration `019`, `/my-clinic` |
| **Notifications** — sidebar bell, fan-out on 4 triggers | migration `020`, `/api/me/notifications` |
| **Events filter fix** — past events no longer vanish | `lib/events/tabs.ts` |
| **Admin brand shell** — navy header, per-section title | `app/admin/page.tsx`, `AdminDashboard` |
| **One-click launcher** | `start-portal.cmd` |

### New verification tooling (use these)

```bash
node scripts/smoke-local.mjs          # 57 checks: every page + API, admin auth enforced
node scripts/verify-saved-items.mjs   # save -> admin unpublishes -> card vanishes -> republish
node scripts/verify-notifications.mjs # publish as admin -> bell count rises -> mark all read
```

All three need the server running on `:8787` first.

---

## 3. Decisions taken (recorded in `docs/DECK_GAP_ANALYSIS.md` §7)

1. **Fraunces ships** as the Gestura substitute. Swap point documented in `app/fonts.ts`.
2. **Ask Lorna is dropped.** Ask the Expert stays as the only AI surface. Consequence:
   **global search lost its main justification** and is deprioritised.
3. **Nav regroups, routes do not move.** Practice Growth = Carts + Refer & Earn +
   Leaderboard. My Clinic = Saved + Toolkit + Resources + Ask the Expert.
4. **Shopify stays stubbed** — no dev-store proof. See the risk note in §5.
5. **Support email = `utkarshrawatofficial@gmail.com` for now**, set as config in
   `.env.local` / `.dev.vars` (both gitignored), **not** hardcoded. Swapping to a company
   address is a one-line config change.

---

## 4. Corrections — four claims in the docs were wrong

Treat old doc claims as **leads to verify, not facts**. Four were wrong this session:

| Claim | Truth |
|---|---|
| "Events On-Demand + My Events tabs are missing" | **Already built.** The real defect was a filter that hid past events. |
| "`media` carries an `audience` column" (my own spec) | **It does not.** Only `toolkit_resources` and `pathways` do. |
| "Consultation booking is a coming-soon stub" | **No stub exists.** Nothing at all is there. |
| "Zero legacy patterns remain" (mine, twice) | **False.** See §6 — grep verified its own grep. |

`docs/DECK_GAP_ANALYSIS.md` §8 now holds a verification pass of every remaining gap claim,
checked against code rather than the deck.

---

## 5. Blocked on other people — no code possible

| Item | Who | Note |
|---|---|---|
| **12/12 KB dossiers `AWAITING APPROVAL`** | Clinical | **Longest lead.** Gates the AI assistant for real practitioners; enforced by a test. Nothing in code moves this. Start it first. |
| **Resend sender domain** | IT | **DNS records — days of lead time.** Request at the same time as the API key, not after. Most likely cause of a delayed launch. |
| Cloudflare account + D1/R2 | IT | |
| Gemini key **with billing** | IT | Current keys are 429 quota-exhausted. A key without quota looks configured and behaves broken. |
| Shopify Admin token + webhook secret | IT | |
| **Real support address** | Business | Currently the personal Gmail, by your decision. One line of config. |
| **Facebook group URL** | Business | Unset, so the link is hidden rather than wrong. |
| Shopify end-to-end proof | You (free, self-serve) | Deliberately skipped. `wn_cart_token` → `note_attributes` reconciliation has only run against stubbed fetches. **Watch the first real draft order.** |
| Real-device mobile pass | You | Only emulated widths checked. |

Go-live once credentials land: ~30 min via `docs/CLOUDFLARE_GO_LIVE.md`. Target is
`ready: true` **and an empty `warnings` array** at `/api/admin/readiness` — both.

---

## 6. Gotchas — read this before touching anything

1. **`npm run build` breaks ANY running server — `dev` *and* `preview:cf`.** Killed the
   worker twice this session. Stop servers first. Intermittent, so it will not reliably
   remind you.
2. **`rm -rf .open-next` fails with `EBUSY`** while a `workerd`/`wrangler` process lives.
   `start-portal.cmd` handles the normal case. One orphan (`workerd`) survived both
   `taskkill /F` and `Stop-Process -Force` today; a reboot clears it.
3. **`preview:cf` takes ~3 minutes and goes silent** at `Collecting build traces`. It is
   not hung. Nothing serves until it finishes.
4. **Running npm from the home folder** gives `Could not read package.json`. Wrong
   directory, not a broken app.
5. **Grep cannot verify a grep-driven change.** Two "zero legacy patterns remain" claims
   were false. The survivors were:
   - `border p-3 ${cond ? 'border-terracotta' : 'border-stone'}` — tokens **split by a
     template literal**, so `border border-stone` never matched.
   - `border border-terracotta`, `border-sage`, `border-forest` — never in the pattern.
   **Verify styling by measuring computed styles in a browser**, not by searching source.
6. **`npm test` passing does not mean it compiles.** 515 tests passed against a
   `NotificationBell` with a JSX syntax error, because no test imports it. `npm run build`
   is a required gate, not a nicety.
7. **Headless Chrome uses overlay scrollbars**, so it cannot reproduce Windows scrollbar
   bugs. A `scrollbarW: 0` measurement there proves nothing about the user's browser.
8. **Watching a port proves something is serving, not that your change is.** A monitor
   reported "LAUNCHER WORKS" while the launcher had failed and the *old* server answered.
9. **Bash→Node path mangling:** `/tmp/x` passed to `node -e` becomes `C:\tmp\x`. Use `C:/…`.
10. **Backticks inside a bash-quoted `node -e` script get executed by bash.** It silently
    stripped every code reference from a doc. Write the script to a file instead.
11. **`grep -c` exits non-zero on zero matches**, truncating an `&&` chain.
12. **Windows CRLF + KB bundle** — `knowledge/**` and `kb.bundle.json` pinned to LF.
13. **OpenNext warns it is not fully Windows-compatible** on every build. Has not caused a
    failure; deploys run on Cloudflare's Linux builders. First suspect for a bizarre
    local-only runtime error; WSL is the escape hatch.

---

## 7. Where to pick up

### Immediately

1. **`git push origin cloudflare-migration`** — one commit ahead.
2. **Chase the KB clinical approvals and the Resend DNS request.** Both are long-lead and
   neither is code.

### Requested but NOT started

**"Use UI/UX skills and 21st.dev to improve the admin landing page."** Asked at the very
end of the session; nothing was done. Notes for whoever picks it up:

- The `ui-ux-pro-max` skill is available and is the right starting point.
- **21st.dev components are React + Tailwind, usually assuming shadcn/ui and often
  framer-motion.** This project has its own design system (`components/ui/index.tsx`) built
  from sampled deck colours. Pulling components in wholesale would fight those tokens and
  add dependencies. Recommendation: take *layout and interaction ideas* from 21st.dev,
  implement with the existing primitives — do not import the components.
- The admin landing is `AdminDashboard`'s section grid (the `GROUPS` array). It is now
  brand-styled but still a plain 4-column grid of equal cards. Obvious improvements: give
  Applications visual priority when items are flagged, surface live counts on the cards,
  and add an at-a-glance strip (pending applications, unread chats, recent sign-ups).

### Then, from the verified gap list (`DECK_GAP_ANALYSIS.md` §8)

1. **Category icons** on the learning catalogue — small, finishes a partly-built item
2. **Consultation + mentoring booking** — blocked: needs a real booking destination
3. **Global search** — demoted; only if practitioners report they cannot find things
4. Deliberately later: polls/surveys, NPD trials, personalisation, native app, patient
   testing area (health-data/consent conversation first)

---

## 8. What has and has not been verified

**Verified exhaustively:** styling. Every practitioner page and all 15 admin sections
measured in a browser via computed styles. Zero hard-bordered boxes, zero square action
buttons, no horizontal overflow at 390px or 1280px.

**Verified by tests:** 520 tests, plus three round-trip scripts against real workerd, plus
migrations `019`/`020` confirmed applied to real local D1.

**NOT verified:** nobody has used the app as a practitioner for an hour — real workflows
end to end. That is the gap tests cannot close. `docs/LOCAL_TEST_DRIVE.md` has the
admin↔practitioner round trips to work through.

---

## 9. Standing conventions (do not violate)

- **TDD** — failing test first. Gates: `npm test` + `npm run build`. Anything touching
  D1/R2/cron/routes **also** needs `npm run preview:cf`.
- **Mock-until-keyed is sacred** — no feature may hard-require a key to boot.
- **Absence omits, never substitutes** — never invent a contact detail, URL or fallback.
- **Verify styling in a browser, not with grep** (§6.5).
- Edited `knowledge/`? → `npm run bundle-kb`, commit `lib/ai/kb.bundle.json`.
- New cron schedule? → edit **both** `wrangler.toml [triggers]` and `lib/cron/map.ts`.
- Never reference `care@wildnutrition.com`.
- **Never touch `Utkarshraw123/practitioner-portal`** — separate personal portfolio repo.
- Small branches off `cloudflare-migration`, each ending green.
