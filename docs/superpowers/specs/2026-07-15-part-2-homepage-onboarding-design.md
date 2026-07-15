# Part 2 — New Homepage, Welcome Onboarding & Navigation — Design

**Date:** 2026-07-15
**Repo:** `practitioner-portal` · Branch: `part-2-homepage`
**Builds on:** Part 1 (`homepage_widgets` table, `hasAccess` helper, migration runner).
**Source plan:** `wild-nutrition-hub-build-plan` Part 2 (deck slides 7 & 8).

## Goal

Replace the current `/dashboard` with the deck's homepage (greeting, Continue Learning,
What's New feed, Quick Links), add a once-per-practitioner cinematic Welcome Experience at
`/onboarding/welcome`, add a context-aware top nav, and give admins a screen to manage the
"What's New" cards without a deploy.

"Done" = a first-login practitioner sees the 2-scene Welcome once, lands on the new homepage
with working nav and Quick Links (unbuilt targets clearly "coming soon"), and an admin can
add/edit/reorder/hide What's New cards live.

## Decisions (locked with user)

1. **Referral tools stay on the homepage** as a compact "Your referrals" card (code, link, key
   stats) — no earning functionality is lost.
2. **Context-aware global header** — one header that reads the `wn_session` cookie server-side
   and swaps between the practitioner nav and the public Apply/Sign in nav.
3. **Add `framer-motion` + `lucide-react`** — matches the Welcome spec's `useScroll`/`useInView`
   requirements.
4. **Coming-soon = shared component behind stub route pages** — nav links resolve to real routes
   that render `<ComingSoon/>`; Parts 3–5 replace the stub bodies.
5. **Welcome backfill** — existing practitioners get `has_seen_welcome = 1` in the migration so
   the 4 live accounts are not ambushed; only new sign-ups see the takeover.
6. **Widget images = URL field for the MVP** — paste a Blob or external URL; full Blob-upload UI
   in the widget admin is deferred (easy later add).

## Architecture

### 1. Data / migrations

New migration appended to `lib/migrations.ts` (never edit a shipped one):

```
id: '008_has_seen_welcome'
ALTER TABLE practitioners ADD COLUMN has_seen_welcome INTEGER NOT NULL DEFAULT 0;
UPDATE practitioners SET has_seen_welcome = 1;   -- backfill existing rows
```

- Runs exactly once via the existing `runMigrations` runner; recorded in `schema_migrations`.
- New sign-ups created after this migration default to `0` (they'll see the Welcome).
- `homepage_widgets` (Part 1) is used unchanged:
  `id, title, body, link_url, image_url, audience DEFAULT 'all', position DEFAULT 0,
  published DEFAULT 1, created_at`.

`lib/db.ts` type additions/exports:
- Extend the `Practitioner` type + `getPractitioner` mapping to include `hasSeenWelcome: boolean`.
- `markSeenWelcome(practitionerId: number): Promise<void>` → `UPDATE ... SET has_seen_welcome = 1`.
- Homepage widget helpers:
  - `listHomepageWidgets(): Promise<HomepageWidget[]>` (admin — all, ordered by `position, id`).
  - `listPublishedWidgetsFor(audience: QualificationStatus | null): Promise<HomepageWidget[]>`
    (public — `published = 1`, then filtered in code through `hasAccess`, ordered by `position`).
  - `createHomepageWidget(input)`, `updateHomepageWidget(id, patch)`, `deleteHomepageWidget(id)`.
  - `HomepageWidget` / `HomepageWidgetInput` types.

### 2. Server session helper

`lib/serverSession.ts`:
```ts
export async function getServerSessionPractitioner(): Promise<Practitioner | null>
```
Reads `wn_session` via `cookies()` (`next/headers`), verifies with the existing
`verifySessionValue()`, resolves via `getPractitioner()`. Used by the layout header and the
`/dashboard` + `/onboarding/welcome` server pages. The request-based `getSessionPractitioner(req)`
is left untouched for API routes.

### 3. Context-aware header

- Extract the current header out of `app/layout.tsx` into `components/SiteHeader.tsx`
  (**server component**). It calls `getServerSessionPractitioner()`:
  - **Signed-in + `status === 'approved'`** → practitioner nav + `LogoutButton`.
  - **Otherwise** → Apply / Sign in (current behaviour).
- Nav items come from a config array; each item may carry `audience?: Audience`, filtered through
  `hasAccess(practitioner, item)`. Top-level items are all `'all'` for now; the mechanism is ready
  for student/qualified-specific items later.

  Top-level items: `Home → /dashboard`, `Learning → /learning`, `Clinical Toolkit → /toolkit`,
  `Community → /community`, `Events → /events`.
- `components/LogoutButton.tsx` — tiny **client** component; POSTs to the existing
  `/api/auth/logout` then `router.push('/dashboard')` (or `location.reload()`).
- Responsive: nav collapses to a hamburger/stacked menu below `md`.
- Footer stays in `layout.tsx` unchanged (already `utkarshrawatofficial@gmail.com`, no `care@`).

### 4. Coming-soon targets

- `components/ComingSoon.tsx` — branded placeholder (`title`, optional `blurb`), on-brand cream/ink
  styling, a "back to Home" link. Not a 404.
- Stub route pages rendering it: `app/learning/page.tsx`, `app/toolkit/page.tsx`,
  `app/community/page.tsx`, `app/events/page.tsx`. Parts 3–5 replace the bodies.
- Quick Links to unbuilt features point at these routes (or a `/coming-soon` fallback for
  My Downloads / My CPD which have no reserved route yet). **Ask Lorna → existing `/assistant`.**

### 5. Cinematic Welcome Experience — `/onboarding/welcome`

- `app/onboarding/welcome/page.tsx` (**server**): requires a session (else `redirect('/dashboard')`);
  if `has_seen_welcome === true` → `redirect('/dashboard')`. Passes `firstName` to the client
  component.
- `components/WelcomeExperience.tsx` (**client**), built to the plan's full spec:
  - Palette: bg `#16233F`, accent `#C1573D`, text `#F3EEE1` (secondary 60–70% opacity), card `#1E2C4C`.
  - Fonts: `Fraunces` (300/400/600 + italic) and `Inter` (400/500/600) via **`next/font/google`**,
    scoped to this route only (intentional break from the brand Gestura/Basis stack).
  - Global grain overlay: inline SVG `feTurbulence` (baseFrequency ~0.85, numOctaves 3, very low
    opacity, `mix-blend-mode: overlay`, `pointer-events: none`).
  - **Scene 1 (Hero):** full-height navy + grain + subtle gradient; logo mark fades in (0.4s); giant
    Fraunces headline `"Welcome, {FirstName}."` word-by-word pull-up (`motion.span` y:20/opacity:0 →
    y:0/opacity:1, stagger 0.08s, `text-[10vw] md:text-[7vw] leading-[0.9]` cream), falling back to
    `"Welcome."`; fade-up description at 0.5s (Inter, cream 70%, max-w ~32rem); pulsing scroll/Continue
    chevron.
  - **Scene 2 (Mission):** navy + grain; centered `#1E2C4C` card, `rounded-2xl`, max-w ~48rem;
    terracotta small-caps eyebrow "Practitioner Education"; multi-style word pull-up heading
    ("This platform was shaped by" Inter / "Lorna Driver-Davies," italic Fraunces accent / "Head of
    Practitioner Education at Wild Nutrition." Inter); char-by-char scroll reveal of "Our mission is
    to support practitioners beyond the consultation room." (`useScroll` offsets `['start 0.8','end
    0.2']`, opacity 0.2→1 staggered by char index); pill CTA "Start Exploring" + lucide `ArrowRight`
    in a circular badge (hover widens gap / scales ~1.1x).
  - Motion rules: every element `useInView {once:true}`; stagger 0.06–0.1s; no video/photo/audio;
    fully responsive (fluid headline clamp, near full-bleed Scene-2 card < 640px).
  - CTA handler → `POST /api/me/seen-welcome` → on success `router.push('/dashboard')`.
- **First-login enforcement:** `app/dashboard/page.tsx` becomes a thin **server** page — reads the
  session; if a practitioner exists and `has_seen_welcome === false` → `redirect('/onboarding/welcome')`;
  otherwise renders the existing client `<DashboardApp/>` (which still owns the logged-out login UI).

### 6. Homepage redesign (`components/DashboardApp.tsx`)

Keeps the logged-out login screen and the `/api/me` + `/api/me/stats` fetches. The logged-in body
is rebuilt as:
- **Greeting** — time-of-day + first name ("Good morning, {First}").
- **Continue Learning** card — `stats.lessonsCompleted` as the Part-3 stub (comment marks the swap
  point), CTA → `/library`.
- **What's New** — horizontal card feed from new `GET /api/me/widgets`; each card shows
  `image_url` (if set), `title`, `body`, links to `link_url`. Empty state when none.
- **Quick Links** grid — Ask Lorna (`/assistant`), Book Technical Consultation, Clinical Toolkit,
  Community, Events, My Downloads, My CPD. Unbuilt targets → coming-soon; built → real route. Cards
  filtered via `hasAccess` where an item carries an audience.
- **Your referrals** compact card — code, link (copy buttons reused), key stats (clicks / orders /
  commission) from existing stats.
- Slim tier line retained; verbose profile block trimmed.
- Fully mobile-responsive.

### 7. Admin "Homepage" tab

- 9th tab in `app/admin/page.tsx`: `components/AdminWidgets.tsx`.
  - List widgets (ordered), create/edit form (title, body, link_url, image_url URL field, audience
    select all/qualified/student, published toggle), reorder via position up/down, hide/show,
    delete.
- APIs (all `isAuthed`-gated, `dynamic = 'force-dynamic'`, zod-validated bodies):
  - `app/api/admin/widgets/route.ts` — `GET` list, `POST` create.
  - `app/api/admin/widgets/[id]/route.ts` — `PATCH` update (fields + position + published), `DELETE`.
- Practitioner-facing API:
  - `app/api/me/widgets/route.ts` — `GET`, session-gated; returns `listPublishedWidgetsFor(audience)`.
  - `app/api/me/seen-welcome/route.ts` — `POST`, session-gated; `markSeenWelcome(practitioner.id)`.

## Data flow

1. New practitioner approved/auto-logged-in → visits `/dashboard` → server sees
   `has_seen_welcome=0` → redirect `/onboarding/welcome` → Welcome renders → CTA POSTs
   `/api/me/seen-welcome` → redirect `/dashboard` → homepage (flag now 1, never shows again).
2. Homepage fetches `/api/me`, `/api/me/stats`, `/api/me/widgets`; What's New is audience-filtered.
3. Admin edits What's New via the Homepage tab → widget rows change → homepage feed reflects it with
   no deploy.
4. Header reads the session server-side on every request → correct nav for logged-in vs public.

## Error handling / edge cases

- Not logged in on `/onboarding/welcome` → redirect to `/dashboard` (which shows the login screen).
- `/api/me/widgets` and `/api/me/seen-welcome` return 401 when no valid session or not approved.
- Widget with no `image_url` renders a text-only card; empty feed renders a friendly empty state.
- `firstName` absent → "Welcome." fallback in the hero.
- Migration is idempotent via the runner (runs once); backfill `UPDATE` is safe to run once.

## Testing (TDD — keep the 183 green, add new)

- **Migration:** `008` adds the column, existing rows backfilled to `1`, existing data intact,
  new inserts default to `0`.
- **DB helpers:** widget CRUD; `listPublishedWidgetsFor` respects `published` + audience via
  `hasAccess`; ordering by `position`; `markSeenWelcome` flips the flag.
- **Admin widget routes:** 401 unauthenticated; create/patch/delete/reorder happy paths; bad body → 400.
- **Practitioner routes:** `/api/me/widgets` audience filtering + 401; `/api/me/seen-welcome` sets
  the flag + 401.
- **Server session helper:** valid/invalid/expired cookie resolution (unit via `verifySessionValue`).
- Welcome UI motion + homepage/nav responsiveness are verified in the **browser preview** (port 3100),
  not unit-tested.

## Dependencies

Add `framer-motion` and `lucide-react` to `package.json`.

## Out of scope (later parts)

- Real pathway progress for Continue Learning (Part 3 swaps the stub).
- Actual Learning / Toolkit / Community / Events pages (Parts 3–5 replace the stubs).
- Blob-upload UI inside the widget admin (URL field only for now).
- Student-specific top-nav items (mechanism ready; no such item yet).

## Acceptance checklist (from the plan)

- [ ] First login shows the 2-scene Welcome once, never again.
- [ ] No image/video asset required for the Welcome page to render.
- [ ] Scene 2 mission quote reveals character-by-character.
- [ ] CTA sets `has_seen_welcome` and routes into the homepage.
- [ ] Welcome + homepage fully responsive to mobile (375px).
- [ ] Quick Links grid present; unbuilt targets clearly "coming soon", not broken.
- [ ] Admin can add/remove/reorder What's New cards without a deploy.
