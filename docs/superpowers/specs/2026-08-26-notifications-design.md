# Notifications — design

Status: **approved 2026-08-26**. Branch `feat/notifications`, off `cloudflare-migration`.

Fills the deck's notification bell — see `docs/DECK_GAP_ANALYSIS.md` §8, which confirms
no notification model exists today (live chat has its own unread badge; that is not a
notifications system).

## 1. What this is

A practitioner sees a bell in the sidebar with an unread count, opens it, and reads a
list of things that happened: new content, a reply to their post, a credited referral,
a paid cart. They can open one, or mark them all read.

**Four triggers, agreed:**

| Trigger | Who is notified |
|---|---|
| Content published (lesson, media, toolkit, pathway) | every approved practitioner the audience gate allows |
| Reply on a community post | the post's author |
| Referral credited | the referrer |
| Patient cart paid | the practitioner who created the cart |

**Not in scope:** email delivery (needs Resend, and it is a separate consent question),
per-item dismissal, expiry/auto-deletion, notification preferences, and any admin-facing
notification. Read/unread plus mark-all-read is the whole lifecycle.

## 2. Data model

Migration `020_notifications`:

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  kind TEXT NOT NULL,        -- 'content' | 'reply' | 'referral' | 'cart'
  title TEXT NOT NULL,
  body TEXT,
  href TEXT,
  read_at TEXT,              -- NULL = unread
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_practitioner
  ON notifications(practitioner_id, read_at);
```

**Fan-out, not broadcast.** Publishing writes one row per eligible practitioner. This was
chosen over broadcast-plus-read-receipts because personal and broadcast notifications then
become the same thing: one table, one query for the list, one query for the count. The
write amplification it trades away is not a real cost at this scale — hundreds of
practitioners and a few publishes a week.

**Rows are self-contained.** `title`, `body` and `href` are written at fan-out time rather
than joined at read time. This is deliberately the **opposite** of the `saved_items`
design, and the reason is what each thing represents:

- a **saved item** describes a *live thing*, so it must reflect the item's current state —
  hence the join and the read-time re-gating;
- a **notification** records *something that happened*, so "New lesson: Iron status" must
  keep reading correctly even if the lesson is later renamed or unpublished.

**Accepted consequence:** an unpublished item can leave a notification whose target no
longer exists. Mitigated by pointing `href` at the **list page** (`/library`, `/toolkit`,
`/resources`, `/learning`) rather than a deep link, so the worst case is landing on a page
where that item is simply not listed — never a 404.

## 3. Where fan-out fires

Emit calls live **inside the `lib/db.ts` functions**, not in the API routes:

| Trigger | Function |
|---|---|
| Content published | `setLessonStatus(id, 'published')`, `setMediaPublished(id, true)`, toolkit publish, pathway publish |
| Community reply | `createCommunityReply()` |
| Referral credited | `creditReferral()` |
| Cart paid | `markCartPaid()` |

**Why the data layer and not the routes:** `markCartPaid` has two call sites — the Shopify
webhook and the local pay route. Emitting at the route layer means remembering it in both,
and the one that gets forgotten is the one that silently stops notifying. Inside the db
function there is a single choke point that cannot drift. `lib/db.ts` already performs
cross-table work (`creditReferral` touches referrals and orders), so this follows the
existing grain rather than cutting against it.

Three rules apply at fan-out:

1. **Never notify the actor.** Replying to your own post does not ping you.
2. **Approved practitioners only.** Pending and flagged accounts are skipped.
3. **Audience gating applies.** Student-only content does not notify qualified HCPs, using
   the same `hasAccess` check the list pages use.

**Idempotence:** `markCartPaid` guards on `status != 'paid'` and `creditReferral` on
`status != 'credited'`. The notification must sit behind the **same** guard — emit only
when the update actually changed a row. Otherwise a Shopify webhook retry would notify a
practitioner repeatedly about one payment.

## 4. API

- `GET /api/me/notifications` → `{ items, unread }`
- `POST /api/me/notifications/read` → marks all read; optional `{ id }` marks one

Both behind the standard `getSessionPractitioner` + `status === 'approved'` guard used by
every other `/api/me/*` route. A practitioner can only ever read or clear their own rows —
the practitioner id comes from the session, never from the request body.

No secrets, no external calls: mock-until-keyed holds trivially.

## 5. UI

- **`components/NotificationBell.tsx`** — bell in the sidebar header beside the wordmark,
  with an unread count badge. Opens a panel that **overlays to the right of the sidebar**;
  280px is too narrow to read notification text in. On mobile it anchors to the existing
  navy top bar.
- **The panel** — newest first, each row showing title, body and relative time. Unread rows
  carry a terracotta dot and sit on a raised card. **Mark all read** in the panel header.
  Clicking a row navigates to its `href` and marks that row read. Empty state uses the
  existing `Empty` primitive.
- **Freshness** — fetch on mount, then poll every **60 seconds** while signed in, and
  refetch whenever the panel opens. `ChatWidget` polls at 2.5s because chat is a live
  conversation; notifications are not, and two aggressive pollers on every page would be
  wasteful.

Built on the brand primitives (`Card`, `Empty`, `Pill`, `Label`). No hard borders, no
square buttons — the app was reskinned off those.

## 6. Tests

TDD, failing test first. No component-test infrastructure exists in this repo (108 test
files, all db/API level) and **this branch does not add any**.

**`tests/notifications-db.test.ts`**
- fan-out reaches approved practitioners only — pending/flagged are skipped
- **never notifies the actor** — replying to your own post is silent
- audience gating applies at fan-out
- unread count counts only rows with `read_at IS NULL`
- mark-all-read affects only that practitioner's rows
- **a repeated `markCartPaid` on an already-paid cart does not notify twice**

**`tests/api-me-notifications.test.ts`**
- 401 unauthenticated, and 401 for a non-`approved` practitioner
- GET returns items plus an unread count
- POST marks all read
- one practitioner cannot read or clear another's notifications

## 7. Gates

`npm test` (baseline **502 passing / 108 files**) and `npm run build`, **plus
`npm run preview:cf`** — this adds migration `020` and two API routes, so it must be proven
to apply in real workerd against local D1, not only in the vitest harness.

## 8. Explicitly out of scope

- Email delivery of notifications
- Per-item dismissal and auto-expiry
- Notification preferences or muting
- Admin-facing notifications
- A header bar: the bell lives in the sidebar precisely so the signed-in shell does not
  change and the pages restyled this session do not need re-verifying.
