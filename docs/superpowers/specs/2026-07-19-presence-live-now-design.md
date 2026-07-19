# Presence — "Live Now" green-dot design

**Date:** 2026-07-19
**Status:** Approved design, ready for implementation plan.
**Feature:** Admin-only, Messenger-style presence. The admin can see which approved
practitioners are online *right now* (green dot + "Online now" list) inside the existing
Live Chat tab, and start a chat with any of them.

---

## 1. Goal & scope

**In scope**
- Track live presence for approved practitioners while they have the portal open and focused.
- Show the admin, in the Live Chat tab:
  - a green dot next to online practitioners in the conversation list (grey dot + "last seen Xm ago" otherwise);
  - an **"Online now (N)"** strip listing currently-live practitioners;
  - the ability to **click an online practitioner to open/start a chat** with them.

**Out of scope (explicitly)**
- Practitioners seeing admin presence or each other's presence (admin-only, one direction).
- A three-state (online/idle/offline) model — two states + "last seen" text instead.
- Real-time transport (Pusher/websockets). We reuse polling, consistent with the live-chat feature.
- Presence anywhere other than the Live Chat tab (e.g. the Practitioners tab) — possible later, not now.

**Definition of "online"**
A practitioner is **online** if their last heartbeat was within the last **90 seconds**.
The browser sends a heartbeat every **30 seconds** while the tab is focused, so three
missed beats marks them offline. Heartbeats pause while the tab is hidden, so "online"
means *actively at the portal now*, not "left a tab open".

---

## 2. Architecture — four isolated units

### Unit 1 — Heartbeat writer (client)
**File:** `components/PresenceBeat.tsx` (new). Renders nothing.
- Mounted globally for signed-in practitioners, next to `ChatGate` in `app/layout.tsx`
  (the layout already computes the approved-practitioner session and passes `signedIn`).
- Behaviour:
  - POST `/api/me/presence` once on mount.
  - `setInterval` every **30_000ms**, but only fire when `document.visibilityState === 'visible'`.
  - On `visibilitychange` → visible, send an immediate beat (so the dot re-lights fast when
    they return to the tab).
  - Fire-and-forget `fetch(..., { method: 'POST', cache: 'no-store', keepalive: true })`;
    ignore errors (presence is best-effort, never blocks the UI).
- **Not** coupled to the chat widget: chat can be closed/unmounted; presence must not depend on it.
- Gated exactly like `ChatGate`: only for signed-in practitioners; nothing on `/admin` or
  `/onboarding`. (A thin `PresenceGate` client wrapper mirrors `ChatGate`, OR `PresenceBeat`
  itself takes `signedIn` and returns `null` when false — implementer's choice; keep it one file.)

**Depends on:** `/api/me/presence`.

### Unit 2 — Presence store (DB)
**Migration 015** (append-only in `lib/migrations.ts`):
```sql
ALTER TABLE practitioners ADD COLUMN last_seen_at TEXT;
```
- One row per practitioner, updated in place — no new table, no unbounded growth. Matches the
  existing `has_seen_welcome` column pattern.
- `Practitioner` type in `lib/db.ts` gains `lastSeenAt: string | null` (mapped from `last_seen_at`).

**Helpers in `lib/db.ts`:**
- `touchPresence(practitionerId: number): Promise<void>` →
  `UPDATE practitioners SET last_seen_at = datetime('now') WHERE id = ?`.
- `listOnlinePractitioners(windowSeconds = 90): Promise<OnlinePractitioner[]>` →
  practitioners with `status = 'approved'` AND
  `last_seen_at >= datetime('now', '-<window> seconds')`, newest-seen first.
  Returns `{ id, name, email, lastSeenAt, conversationId: number | null }` where
  `conversationId` is their open conversation if one exists (LEFT JOIN on
  `chat_conversations` where `status='open'`), else `null`.

**Change to existing helper:** `listConversationsForAdmin` adds a computed
`online: boolean` per row (`last_seen_at >= datetime('now','-90 seconds')`), joined from
`practitioners`.

**Constant:** `PRESENCE_WINDOW_SECONDS = 90` exported from `lib/db.ts` (single source of truth,
used by both `listOnlinePractitioners` default and the `listConversationsForAdmin` computation).

**Depends on:** the `practitioners` and `chat_conversations` tables.

### Unit 3 — Presence read + write APIs
- **`app/api/me/presence/route.ts`** — `POST` only. `getSessionPractitioner(req)`; require
  `status === 'approved'`; call `touchPresence(p.id)`; return `204`/`{ ok: true }`. Writes only
  the caller's own row — no cross-practitioner exposure. `export const dynamic = 'force-dynamic'`.
- **`app/api/admin/presence/route.ts`** — `GET` only. `isAuthed(req)` guard; return
  `{ online: OnlinePractitioner[], count }` from `listOnlinePractitioners()`.
  `export const dynamic = 'force-dynamic'`.

**Depends on:** Unit 2, `lib/practitionerAuth`, `lib/adminAuth`.

### Unit 4 — Admin UI (Live Chat tab)
**File:** `components/AdminChat.tsx` (extend; reuse its existing 2.5s poll loop).
- Add `online` state; the existing poll `setInterval` also fetches `/api/admin/presence`
  (`cache: 'no-store'`) alongside `loadList`.
- **"Online now (N)" strip** above the conversation list:
  - Renders each online practitioner: green dot + name (+ email subtle).
  - Clicking one calls `openOrStartConversation(practitioner)`:
    - if `conversationId` present → `openConvo(conversationId)` (existing path);
    - else → POST the admin "start conversation" endpoint (see below), then open the returned id.
  - Empty state: "No practitioners online right now."
- **Conversation list rows** gain a status dot: green when `convo.online`, else a grey dot
  with the existing `timeAgo(lastMessageAt)` (already rendered) — reuse existing `timeAgo`.

**Admin-initiated conversation (the one conversation-model change):**
- Helper `getOrCreateOpenConversationForAdmin(practitionerId: number)` in `lib/db.ts` — thin
  wrapper over the existing get-or-create so the admin can open a thread with a practitioner
  who has never messaged. No first message is inserted; it just ensures an open conversation
  exists (subject e.g. `'Started by Wild Nutrition'`).
- Endpoint: extend `app/api/admin/chat/route.ts` with a `POST` (admin-auth) taking
  `{ practitionerId }` → returns `{ conversationId }`. (Kept in the existing chat route to
  colocate with the conversation list.)

**Depends on:** Units 2 & 3, existing `openConvo`/reply flow.

---

## 3. Data flow

```
Practitioner browser (focused tab)
  └─ PresenceBeat ── POST /api/me/presence ──► touchPresence(id)  [every 30s]
                                                    │
                                              practitioners.last_seen_at = now
                                                    │
Admin Live Chat tab (2.5s poll) ── GET /api/admin/presence ──► listOnlinePractitioners(90s)
                               └── GET /api/admin/chat ───────► listConversationsForAdmin (+online)
                                                    │
                        "Online now (N)" strip + green dots on conversation rows
                                                    │
                        click online practitioner ── POST /api/admin/chat {practitionerId}
                                                    └─► getOrCreateOpenConversationForAdmin → open thread
```

## 4. Error handling & edge cases
- **Heartbeat failures** are swallowed client-side; a dropped beat just risks a brief false-grey.
- **Clock/timezone:** all comparisons use SQLite `datetime('now')` on both write and read, so no
  cross-timezone skew. Timestamps stored as UTC text like the rest of the schema.
- **Never-seen practitioners:** `last_seen_at IS NULL` → never online, no "last seen" text.
- **Non-approved / signed-out:** never beat (gated in the client) and rejected server-side
  (`status !== 'approved'` → 401), so they can never appear online.
- **Admin start-chat idempotency:** get-or-create means repeated clicks reuse the same open thread.
- **Hidden-tab honesty:** background tabs stop beating and fall to grey within 90s — intended.

## 5. Testing (keep all existing tests green; follow existing patterns)
- **`tests/presence-db.test.ts`** (new, pattern of `tests/chat-db.test.ts`):
  - `touchPresence` sets `last_seen_at`; a fresh touch makes `listOnlinePractitioners` include them.
  - Window boundary: a row whose `last_seen_at` is older than 90s (written explicitly) is excluded;
    within 90s is included.
  - `listOnlinePractitioners` returns `conversationId` when an open convo exists, else `null`.
  - Only `status='approved'` practitioners are returned.
- **`tests/api-presence.test.ts`** (new, pattern of `tests/api-chat.test.ts`):
  - `POST /api/me/presence` → 401 when unauthenticated / non-approved; success touches the row.
  - `GET /api/admin/presence` → 401 without admin auth; returns `{ online, count }` with auth.
- **Extend `tests/api-chat.test.ts`:** `POST /api/admin/chat { practitionerId }` returns a
  conversation id and is idempotent (get-or-create).

## 6. Files touched
**New:** `components/PresenceBeat.tsx`, `app/api/me/presence/route.ts`,
`app/api/admin/presence/route.ts`, `tests/presence-db.test.ts`, `tests/api-presence.test.ts`,
this spec.
**Edited:** `lib/migrations.ts` (015), `lib/db.ts` (type + `touchPresence`,
`listOnlinePractitioners`, `getOrCreateOpenConversationForAdmin`, `listConversationsForAdmin`
`online` field, `PRESENCE_WINDOW_SECONDS`), `app/layout.tsx` (mount `PresenceBeat`),
`app/api/admin/chat/route.ts` (POST start-conversation), `components/AdminChat.tsx` (online
strip + dots), `tests/api-chat.test.ts` (start-conversation test).

## 7. Deployment notes
- Migration 015 runs automatically on first client connection (per `lib/migrations.ts`).
- No new npm dependencies. No new env vars. No cron. Works on the current Vercel Hobby plan
  (presence is client-poll driven, not cron driven).
- Deploy via `npx vercel --prod --yes` (CLI already authed), consistent with the handoff.
