# Admin landing page — triage band + section-grid hierarchy

Date: 2026-08-27. Branch: `feat/admin-landing-triage` off `cloudflare-migration`.
Target: the section grid in `components/AdminDashboard.tsx` (the `GROUPS` array and its
render block), plus one new admin API route.

## 1. Problem

The admin landing is 17 identical white cards in a uniform `sm:grid-cols-2 lg:grid-cols-4`
grid, split into five titled groups. Concretely:

1. **No prioritisation.** Applications — the only genuinely time-critical queue — renders
   identically to Calendar. The one signal it carries is a small corner badge.
2. **No live state.** 2 of 17 cards carry a count. To find out whether anything needs
   attention, an admin must click into sections one at a time.
3. **Two orphaned groups.** *Applications* and *Communication* hold a single card each. In
   a 4-column grid each wastes three columns, so the page is taller than its content.
4. **Failing text contrast** (measured, not grepped — see §5):

   | Token | Used for | Ratio on white | WCAG AA (<18px needs 4.5:1) |
   |---|---|---|---|
   | `text-ink2/55` | group headings, micro-labels | 2.99:1 | fail |
   | `text-ink2/60` | card descriptions | 3.40:1 | fail |
   | `text-ink2/75` | — | 5.04:1 | pass |

## 2. Decisions taken

Confirmed with the user on 2026-08-27:

| # | Question | Decision |
|---|---|---|
| 1 | Strip, promoted Applications card, or both? | **Strip only.** The triage band owns all urgency; Applications stays a normal card with its existing badge. Both would make the same number shout twice. |
| 2 | How wide should the contrast fix go? | **Admin landing only.** The failing values come from the shared `Label` primitive (`components/ui/index.tsx`), used by ~43 components; fixing it at source needs a far wider re-verification pass than this change. Logged as a follow-up. |
| 3 | Merge the single-card *Communication* group? | **Merge** into *Community and events* → "Community & communication". Four groups, no orphan row. |

**Not received:** the user's message stated "Important constraint from the" and was
truncated. They said to proceed anyway. This design was therefore built without that
constraint and may need revisiting once it is known.

## 3. Design

### 3.1 Triage band (new)

A full-width `bg-navy-soft` card immediately below the `h1`, holding four tiles.

- Layout: `grid sm:grid-cols-2 lg:grid-cols-4`, separated by `border-r border-white/10`
  with `max-lg:border-0` so the rule does not strand itself when the row wraps.
- Each tile: uppercase `tracking-label` micro-label in `terracotta-light`, a large
  Fraunces figure in white, and a `→` affordance. The whole tile is a button that opens
  the relevant section.
- Figures use `tabular-nums` so digits do not reflow as the pollers update them.
- Chosen navy because white-on-navy is 17.35:1 — contrast is trivially safe — and it
  echoes the practitioner sidebar, so admin reads as the same product from the other side.

Tiles, and where each number comes from:

| Tile | Source | Opens |
|---|---|---|
| Awaiting review | `flaggedApplications` from the new endpoint | `applications`, tab `flagged` |
| Unread chats | **existing `chatUnread` state** — not the endpoint (see §3.3) | `chat` |
| Referrals to approve | `referralsAwaitingApproval` from the new endpoint | `referrals` |
| New this week | `newPractitioners7d` from the new endpoint | `applications`, tab all |

**Zero state:** figures render `0` muted (`text-white/40`). The band does not collapse or
disappear — it is wayfinding as much as alerting, and a band that vanishes when quiet
teaches the admin to distrust its absence.

### 3.2 Section grid

- Five groups become four: *Communication* (Live Chat) folds into
  **"Community & communication"**.
- Group headings: `text-ink2` solid (10.57:1) at 11px uppercase `tracking-label`, followed
  by a `flex-1 border-t border-ink/10` hairline, giving the page vertical rhythm it
  currently lacks.
- Card descriptions: `text-ink2/60` → `text-ink2/75`.
- Cards gain `focus-visible:ring-2 focus-visible:ring-terracotta-mid focus-visible:ring-offset-2`
  — they are `<button>`s and keyboard users currently get only the UA default.
- Corner badges stay exactly as they are on Applications and Live Chat.

### 3.3 Counts — only where one genuinely exists

`lib/db.ts` has helpers for flagged applications, admin unread chat, and referrals awaiting
approval. It has **no** queue for factory drafts, pearls, calendar, media, lessons,
pathways or toolkit — there is no `factory` function in `lib/db.ts` at all.

Those cards therefore get **no number**, not a decorative `0`. This is the
*absence omits, never substitutes* rule: a `0` on a card with no underlying queue asserts
"nothing to do here", which is a claim the data cannot support.

**Unread chats is deliberately excluded from the endpoint.** `AdminDashboard` already runs
a 2.5s poller that owns `chatUnread` for the toast. Serving the same figure from a second
source on a different refresh cadence would let the band and the badge disagree.

### 3.4 New endpoint

`GET /api/admin/overview` — `isAuthed`-gated, `export const dynamic = 'force-dynamic'`,
401 `{error:'Unauthorised'}` when unauthed, matching every other admin route.

```
{ flaggedApplications: number,
  referralsAwaitingApproval: number,
  newPractitioners7d: number }
```

Composed from `listPractitioners('flagged')`, `listReferralsAwaitingApproval()`, and one
new `lib/db.ts` helper `countPractitionersSince(sqlUtc: string): Promise<number>`.

It **replaces** the existing standalone flagged-count `fetch` in `AdminDashboard`, so the
landing makes one overview request rather than growing a second one. Fetched on mount and
whenever `section` changes back to null (i.e. on returning home after a decision).

## 4. Testing

`tests/api-admin-overview.test.ts`, following the `tests/api-admin-referrals.test.ts`
pattern (temp `DB_PATH`, `resetDbForTests()` in `afterEach`, SHA-256 cookie):

1. 401s without the admin cookie.
2. Returns all three keys for an authed admin.
3. Counts a flagged practitioner and ignores an approved one.
4. **7-day boundary:** a practitioner created 8 days ago is excluded; one created 6 days
   ago is included.

**No component tests exist in this repo**, so nothing in the suite can vouch for the
layout. `npm test` passing proves the endpoint works and nothing more.

## 5. Verification

- `npm test` — full suite green (baseline 520).
- `npm run build` — the real type-check gate; stop all servers first.
- `npm run preview:cf` — required: new route + new D1 query.
- **Browser-measured computed styles** at 1280px and 390px: every text colour on the
  landing at ≥4.5:1, no horizontal overflow, focus ring visible on keyboard traversal.
  Grep cannot verify a grep-driven change (`NEXT_SESSION.md` §6.5).

## 6. Out of scope / follow-ups

- **Fix `Label` and the `/60` descriptions at source** in `components/ui/index.tsx` — the
  contrast defect is systemic across ~43 components. Deliberately deferred (decision 2).
- Per-card counts for content sections — needs queue semantics that do not exist in the
  data model yet.
- 21st.dev components are **not** imported. They assume shadcn/ui + framer-motion and
  would fight this project's own tokens. Conventions taken (`tabular-nums`, the
  `border-r`/`max-lg:border-0` divided row); no dependency added.
