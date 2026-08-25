# Brand UI redesign — design system + progress

Goal: make the portal look like the "Hub Ideas v2" deck. Branch
**`feat/brand-ui-redesign`** (pushed, **not merged**). First commit: `326a09b`.

## 1. Why the app looked off-brand (root cause)

`tailwind.config.ts` declared `font-heading: Gestura` and `font-body: Basis` — but
**neither font was ever loaded**: no font files, no `@font-face`, no `next/font`.
Every heading silently fell back to **Georgia**, body to system-ui. The app had never
rendered in a brand typeface. That, plus the old palette, was most of the problem.

## 2. Typography

| Role | Brand (licensed, unavailable) | Shipped substitute |
|---|---|---|
| Display serif | **Gestura** | **Fraunces** (`SOFT`/`WONK` axes forced to 0 in `globals.css` so it reads refined, not quirky) |
| Body grotesque | **Basis Grotesque** | **Inter** |

Loaded in `app/fonts.ts` via `next/font/google`, which **self-hosts at build time** —
no runtime request, so it works on Workers.

> **Swap point:** if the licensed webfonts ever arrive, replace the two `next/font/google`
> calls in `app/fonts.ts` with `next/font/local`, keep the CSS variable names
> (`--font-display`, `--font-sans`), and nothing else changes.
>
> Note `axes` cannot be combined with an explicit `weight` array — that's a build error.
> Leave the weight variable.

## 3. Colour tokens — sampled, not guessed

Extracted the deck's 26 embedded mockup JPEGs from the PDF and decoded actual pixel
values (`jpeg-js`). Live in `tailwind.config.ts`:

| Token | Hex | Sampled from |
|---|---|---|
| `navy` | `#061B32` | sidebar (18% of the dashboard mockup) |
| `navy-soft` / `navy-mid` | `#112031` / `#16283C` | navy cards / hover |
| `cream` | `#FAF6F3` | page canvas (21.9%) |
| `blush` / `blush-deep` | `#F2EAE2` / `#EDE5DD` | content cards |
| `terracotta` | `#8B3324` | deep accent |
| `terracotta-mid` | `#C38A6B` | category pills, active states |
| `terracotta-light` | `#EBBAA5` | peach highlights |
| `sage` / `sage-pale` | `#C9CAB6` / `#EEEAD0` | sage pills |
| `olive` | `#A4A66B` | progress bars |
| `bronze` | `#AC7D57` | steppers, CPD/gold accents |
| `ink` / `ink2` / `stone` | `#0A1A2F` / `#33404F` / `#E4DDD6` | text, borders |

**Key decision:** the pre-existing token *names* (`ink`, `cream`, `terracotta`,
`sage`, `stone`, `forest`) were **re-pointed** at brand values rather than replaced.
That shifted all 43 components to the brand palette without editing 43 files.
`forest` is now an alias of navy — legacy usages inherit sensibly.

Also added: `rounded-card` (16px), `rounded-pill`, `shadow-card`/`shadow-lift`,
`tracking-label` (0.15em, for uppercase micro-labels).

## 4. Shell + primitives

- **`components/SideNav.tsx`** — the deck's persistent navy sidebar: 280px (`w-sidebar`), wordmark +
  "In Practice" lockup, terracotta line icons, active state, "Need help? Contact our
  team" footer. Collapses to a navy top bar + slide-in drawer under `lg`.
- **`components/Chrome.tsx`** — the frame. Owns **both** the per-route chrome decision
  and the sidebar space reservation (`lg:pl-sidebar`), deliberately together because
  they need identical path logic and would otherwise drift.
  - `/onboarding/*`, `/admin`, `/pay/*` → **no chrome** (full-takeover routes)
  - signed in → navy sidebar
  - signed out → slim top bar (Apply / Sign in)
  - It supersedes `ChromeGate` for the shell; `ChromeGate` still exists.
- **`components/ui/index.tsx`** — primitives: `Page`, `PageTitle`, `SectionTitle`,
  `Label`, `Card` (tones white/blush/navy), `Pill` (terracotta/sage/outline/navy),
  `Button`, `GhostButton`, `ActionLink`, `Progress`, `Empty`.
- **`lib/format.ts` `formatMoney()`** — all money rendering (no hardcoded `£`).

## 5. Progress

| Area | State |
|---|---|
| Design tokens + fonts | **Done** |
| App shell (sidebar, mobile drawer, route gating) | **Done** |
| UI primitives | **Done** |
| **Dashboard** (`components/DashboardApp.tsx`) | **Done** — rebuilt against the deck's homepage: navy hero with greeting, Continue Learning card, What's New grid with pills, quick links, referral stats |
| All other practitioner pages | **Inherit palette + fonts automatically**, but still use old layout patterns (hard borders, square corners, `max-w-5xl`). Better, not finished. |
| Admin console (16 sections, 17 `Admin*` components) | Same — palette only |
| Login screen | Done (restyled with primitives) |

**Remaining surface:** ~42 components, 19 pages.

## 6. Verified

Checked in-browser via computed styles (screenshots unavailable — the Browser pane
won't composite unless displayed):

- sidebar `rgb(6,27,50)` @ 280px with the full audience-gated nav
- canvas `rgb(250,246,243)`, pills `rgb(195,138,107)`, card radius `16px`
- `h1` = Fraunces @ 38px, white on the navy hero
- at 375px: sidebar hidden, burger present, **no horizontal overflow**
- `/admin` renders with no `<aside>`; `/apply` signed-out gets the top bar
- **437 tests green, production build clean.** No logic or API changes.

## 7. Open design questions

1. **Which sidebar?** The deck shows two treatments — **dark navy** (Ask Lorna screen,
   implemented) and **light cream with a terracotta active pill** (Events screen).
   Navy was chosen as the stronger brand statement; confirm.
2. ~~**Is Fraunces close enough to Gestura?**~~ **DECIDED 2026-08-25: yes, ship Fraunces.**
   The swap point above stays documented if the licensed font ever arrives. The reskin
   is unblocked; no further sign-off is needed to restyle the remaining 42 components.
3. **Photography.** The mockups lean heavily on brand photography and Lorna's video
   stills; none of those assets are available. Cards currently rely on whatever
   `imageUrl` the data carries.
4. ~~**Nav IA**~~ **DECIDED 2026-08-25** — regroup only, no routes move; see
   `DECK_GAP_ANALYSIS.md` §7. Q1 (navy vs cream sidebar) and Q3 (photography) stay open.
   Original note — see `DECK_GAP_ANALYSIS.md` §5. The deck's sidebar has *Practice Growth*
   and *My Patients/My Clinic*, and omits Patient Carts / Refer & Earn / Leaderboard.
   Restyling is safe; renaming or moving routes is a product decision.

## 8. Recommended next steps

1. Get sign-off on the Dashboard direction (and Q1–Q2 above) **before** touching more
   components — one page is cheap to redo, forty is not.
2. Then roll the primitives through practitioner pages in this order: Learning →
   Toolkit → Resources → Community → Events → Carts → Referrals → CPD → Assistant.
3. Then the admin console (lower priority — internal users).
4. Merge `feat/brand-ui-redesign` into `cloudflare-migration` at a sensible checkpoint;
   it is currently the only unmerged branch.
