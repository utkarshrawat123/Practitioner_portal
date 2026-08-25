# Pick up here — session handover (updated 2026-08-25, session 2)

Read `HANDOVER.md` first for the app itself. **This file is only "where we are right
now and what to do next."**

---

## 1. State in one block

```
repo     https://github.com/utkarshrawat123/Practitioner_portal
default  cloudflare-migration    @ 5de6544  (reskin merged in; decisions recorded)
open     feat/go-live-hardening  @ 15b4fa9  (complete, green, NOT merged)
open     feat/saved-items        @ 09a79d5  (spec only, no code yet)
local    C:\Users\UtkarshRawat\Projects\practitioner-portal
tests    468 passing / 103 files
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
npm test            # 468
npm run dev         # :3100
npm run preview:cf  # :8787 — real workerd + local D1/R2
npm run build       # STOP the dev server first (see §5)
```

Local admin password: **`preview-admin`**. Practitioner sign-in: `/dashboard` → enter a
seeded email → the magic link appears **on screen**. Seeded accounts include
`sarah.whitfield@example.com`.

---

## 2. Decisions taken this session (these unblock the roadmap)

Recorded in full in `docs/DECK_GAP_ANALYSIS.md` §7.

| # | Decision |
|---|---|
| 1 | **Fraunces ships** as the Gestura substitute. The reskin no longer waits on sign-off; the swap point in `app/fonts.ts` stays documented. |
| 2 | **Ask Lorna is dropped from scope.** Ask the Expert stays as the only AI surface. Consequence: **global search loses its main justification** and drops to item 6. |
| 3 | **Nav regroups, routes do not move.** *Practice Growth* = Carts + Refer & Earn + Leaderboard. *My Clinic* = saved resources + Toolkit. No renames, no data migration. |
| 4 | **Shopify stays stubbed** — no dev-store proof. See the risk note in §4. |

Revised build order: saved resources → nav regroup → Events On-Demand/My Events tabs →
consultation booking → notifications → global search (demoted).

---

## 3. What this session did

**Merged:** `feat/brand-ui-redesign` fast-forwarded into `cloudflare-migration`. The repo
had no unmerged branches at that point.

**`feat/go-live-hardening` (complete, green, unmerged)** — removed every hardcoded
personal/placeholder contact detail from shippable code and closed the readiness blind
spot. 8 commits, TDD throughout, 437 → 468 tests.

The design rule, which matters more than the diff: **absence omits, never substitutes.**
No configured address means no contact line — never a wrong one. A missing address is
visible in readiness; a wrong address is invisible and reaches practitioners.

| Change | Where |
|---|---|
| `lib/support.ts` — `supportEmail()`, `fbGroupUrl()`, `outboundUserAgent()`, all null-when-unset | new |
| Practitioner emails + SMTP reply-to | `lib/emails/templates.ts`, `lib/providers/smtp.ts` |
| Chat alerts skip rather than mail a personal inbox | `lib/chat/alerts.ts` |
| Outbound User-Agent to **external register sites** | `lib/registers/http.ts`, `lib/media/thumbnail.ts` |
| Duplicate-application error copy | `app/api/apply/route.ts` |
| Client surfaces take config **as props from server pages** | `SideNav`, `CertificationUpload`, `CommunityApp` |
| Readiness: `support_email`, `fb_group`, `d1_id` + localhost-`PORTAL_URL` warning | `lib/readiness.ts` |

**`feat/saved-items`** — spec only, no code:
`docs/superpowers/specs/2026-08-25-saved-items-my-clinic-design.md`.

---

## 4. Blocked on other people (no code possible)

| Item | Blocker |
|---|---|
| **Support address + Facebook group URL** | **Business decision — needed before launch.** `SUPPORT_EMAIL` is required by readiness; until it is set, practitioners have no contact route (by design, not by accident). |
| **Resend sender domain** | **DNS records — has a lead time of days.** Request from IT *at the same time as the API key*, not after. Most likely cause of a delayed launch. |
| Go-live (Track A) | IT: Cloudflare account + D1/R2, Resend key, Gemini key **with billing** (current keys are 429 quota-exhausted), Shopify Admin token + webhook secret. |
| KB clinical content | All **12** `knowledge/` dossiers are `AWAITING APPROVAL` drafts. Enforced by test. **Longest-lead item — start it in parallel, it will not compress at the end.** |
| Shopify end-to-end proof | **Deliberately not done.** The `wn_cart_token` → `note_attributes` reconciliation has only run against stubbed fetches. The first real draft order happens in production — watch it on launch day. |
| Real-device mobile pass | Only checked at 375px in devtools |
| Referral email invites | Deliberately not built — consent/GDPR call for the business |

---

## 5. Gotchas that cost time (both sessions)

1. **`npm run build` corrupts `.next` if a dev server is running.** Kill dev, `rm -rf .next`, restart.
2. **`preview:cf` needs `outputFileTracingIncludes`** in `next.config.mjs` for `@libsql/**`. **Do not remove that block.**
3. **`rm -rf .open-next` fails with `EBUSY`** while any `workerd`/`wrangler` process lives.
   Hit again this session. Fix: stop every `workerd`/`node` process, `rm -rf .open-next`, restart.
4. **`.dev.vars`** (gitignored) supplies secrets to `wrangler dev` — the way to exercise keyed paths locally.
5. **Windows CRLF + the KB bundle** — `knowledge/**` and `kb.bundle.json` are pinned to LF. Don't undo it.
6. **Bash→Node path mangling:** a `/tmp/...` path passed to `node -e` becomes `C:\tmp\...`. Use `C:/...` form.
7. **`grep -c` exits non-zero when the count is 0**, which silently truncates an `&&` chain. Use `;`.
8. **`NEXT_PUBLIC_*` is a trap for runtime config.** Next inlines it at build time. Verified that
   `NEXT_PUBLIC_FB_GROUP_URL` is *not* currently inlined (it is read server-side and passed as a prop),
   but the name still invites the mistake. **Renaming it to `FB_GROUP_URL` is a pending suggestion.**
9. **Docs drift is real** — re-check `HANDOVER.md` §13 and the test count after any chunk of work.

---

## 6. Local demo data

The local D1 (`.wrangler/state/`, shared between `dev` and `preview:cf`) is seeded:
8 practitioners (2 deliberately **flagged**), 4 lessons, 3 media, 2 pathways with modules,
4 toolkit items, 3 events, 3 pearls, 3 widgets, 3 community posts, 3 carts (2 paid),
1 **credited £50 referral**.

Wipe with: stop servers → delete `.wrangler/state/` → restart (schema self-migrates).

---

## 7. Where to pick up

1. **Merge `feat/go-live-hardening`** into `cloudflare-migration` (green, verified in workerd).
2. **Decide the `FB_GROUP_URL` rename** (§5.8) — cheapest before merge.
3. **Build `feat/saved-items`** from its spec, then write its plan the same way
   (`docs/superpowers/plans/`). Branch it off `cloudflare-migration` *after* the merge in step 1
   so it inherits the reskin primitives.
4. **Then the nav regroup** — needs section headers in `SideNav`, which does not have them yet.
   It also rescues `/resources`, `/library` and `/assistant`, which are **not in the sidebar at all**
   today and reachable only from Dashboard quick-links.

---

## 8. Standing conventions (do not violate)

- **TDD** — failing test first. Two gates before "done": `npm test` + `npm run build`.
  Anything touching D1/R2/cron/routes **also** needs `npm run preview:cf`.
- **Mock-until-keyed is sacred** — no feature may hard-require a key to boot.
- **Absence omits, never substitutes** — never invent a contact detail, URL or fallback identity.
- Edited `knowledge/`? → `npm run bundle-kb` and commit `lib/ai/kb.bundle.json`.
- Adding a cron schedule? → edit **both** `wrangler.toml [triggers]` **and** `lib/cron/map.ts`.
- Never reference `care@wildnutrition.com`.
- Never touch `Utkarshraw123/practitioner-portal` (separate personal portfolio repo).
- Small branches off `cloudflare-migration`, each ending green.
