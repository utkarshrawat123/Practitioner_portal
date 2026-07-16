# Live Chat + Capture + Insights — Design

**Date:** 2026-07-16 · **Repo:** `practitioner-portal` · **Status:** approved, ready for plan.

## Goal
A live support chat on the practitioner portal. Practitioners message from anywhere in
the portal; a shared admin (the WN team, behind the existing `wn_admin` console) answers.
Every message is captured to a durable database. The admin gets a near-instant popup when
a message arrives, an email backstop if nobody is watching, and can generate monthly
insight reports plus an AI-consolidated FAQ view.

## Key decisions (locked)
- **Transport: fast polling** (~2.5s) against Turso. No new services, no cost, fits the
  existing Next.js 14 / Turso / Vercel serverless stack. Upgradeable to Pusher later
  without changing the data model.
- **Missed-message handling: in-app popup + email backstop.** Popup when the admin is in
  the console; a single email to `utkarshrawatofficial@gmail.com` (live Gmail SMTP) if a
  message sits unanswered > 5 min.
- **Widget: floating bubble on every signed-in portal page** (hidden on `/admin`,
  `/onboarding`).
- **Insights: stats now + AI when ready.** Always-on non-AI analytics; AI FAQ clustering
  via the existing Gemini `selectProvider` seam, degrading gracefully on 429 quota.
- **Identity is implicit** — the portal is gated, so every conversation ties to a known
  approved practitioner. No anonymous chat.

## Data model — migration `013_live_chat`
Two tables, following the raw-SQL + `SCHEMA`/migrations convention (append-only).

### `chat_conversations`
| column | type | notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| practitioner_id | INTEGER NOT NULL | FK practitioners |
| status | TEXT NOT NULL DEFAULT 'open' | open \| closed |
| subject | TEXT | snippet of the first message |
| created_at | TEXT DEFAULT datetime('now') | |
| updated_at | TEXT | last activity (any message) |
| last_practitioner_at | TEXT | last practitioner message time |
| last_admin_at | TEXT | last admin reply time |
| alerted_at | TEXT | when the missed-message email was sent (dedupe) |

Indexes: `status`, `updated_at`, `practitioner_id`. **One open conversation per
practitioner** (get-or-create); closing archives it, a new message reopens/creates one.

### `chat_messages`
| column | type | notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| conversation_id | INTEGER NOT NULL | FK chat_conversations |
| sender | TEXT NOT NULL | practitioner \| admin |
| body | TEXT NOT NULL | |
| created_at | TEXT DEFAULT datetime('now') | |
| read_by_admin | INTEGER NOT NULL DEFAULT 0 | |
| read_by_practitioner | INTEGER NOT NULL DEFAULT 0 | |

Index: `conversation_id`.

## Practitioner side
- `components/ChatWidget.tsx` (client): floating bubble bottom-right; opens a panel with
  history + composer. Polls every ~2.5s while signed in; unread dot when closed.
- Mounted in `app/layout.tsx` behind a new `components/ChatGate.tsx` (client) that shows
  the widget only when a practitioner session exists and the path is not `/admin`
  or `/onboarding` (mirrors `ChromeGate`). Server passes session presence in.
- APIs (practitioner-session + `approved` gated, `force-dynamic`, zod-validated):
  - `GET /api/me/chat` → open conversation + messages; `?since=<id>` returns only newer;
    marks admin messages `read_by_practitioner`.
  - `POST /api/me/chat` `{ body }` → get-or-create open conversation, append message,
    bump `updated_at`/`last_practitioner_at`, reset `alerted_at`.

## Admin side
- New tab **"Live Chat"** (16th) in `components/AdminDashboard.tsx` →
  `components/AdminChat.tsx`: two-pane (conversation list w/ unread badges + sorted by
  activity | thread w/ reply box + Close/Reopen).
- **Capture popup at the shell level:** a lightweight poller in `AdminDashboard` polls
  unread count every ~2.5s regardless of active tab; on a new unread it raises a toast +
  updates a title-bar count; click jumps to Live Chat. Optional soft chime.
- APIs (`isAuthed`-gated, `force-dynamic`):
  - `GET /api/admin/chat` → conversation list + last message + unread counts;
    `?since=<id>`/`?unread=1` for the shell poller.
  - `GET /api/admin/chat/[id]` → full thread; marks `read_by_admin`.
  - `POST /api/admin/chat/[id]` `{ body }` → admin reply; bump `last_admin_at`,
    clear `alerted_at`.
  - `POST /api/admin/chat/[id]/close` → toggle status.

## Missed-message email backstop
- `GET /api/cron/chat-alerts` (`CRON_SECRET` Bearer-gated, mirrors `cron/heartbeat`).
  Vercel schedule in `vercel.json`, every 5 min. Finds open conversations whose latest
  message is from the practitioner, older than 5 min, with `alerted_at` null or older than
  the message → sends ONE email via `sendSmtpEmail` to `utkarshrawatofficial@gmail.com`,
  stamps `alerted_at`. Admin reply resets `alerted_at`, re-arming the backstop.

## Insights & FAQ report
- `components/ChatInsights.tsx`, surfaced under the Live Chat tab.
- **Always-on stats** (`GET /api/admin/chat/insights?from=&to=&practitionerId=&status=`):
  monthly message/conversation volume, avg first-response time, busiest weekday/hour,
  most-active practitioners, top keywords (stopword-filtered frequency over practitioner
  messages). CSV export reusing the reporting-export pattern.
- **AI FAQ consolidation** (`POST /api/admin/chat/insights/faqs`): `lib/ai/chatInsights.ts`
  `generateFaqConsolidation(messages)` via the existing `selectProvider()` seam + Gemini
  schema (mirrors `lib/ai/factory.ts`), `GEMINI_API_KEY`→`KEY2` fallback. Returns ranked
  FAQs `{ question, suggestedAnswer, frequency, examples[] }` + a monthly narrative.
  On 429/no-key: returns `{ aiAvailable: false }` and the UI shows "AI temporarily
  unavailable" while stats still render.

## New / changed files
- `lib/migrations.ts` (+013), `lib/db.ts` (chat helpers + `chatStats`).
- `lib/ai/chatInsights.ts`.
- `components/{ChatWidget,ChatGate,AdminChat,ChatInsights}.tsx`.
- `app/api/me/chat/route.ts`.
- `app/api/admin/chat/route.ts`, `app/api/admin/chat/[id]/route.ts`,
  `app/api/admin/chat/[id]/close/route.ts`, `app/api/admin/chat/insights/route.ts`,
  `app/api/admin/chat/insights/faqs/route.ts`.
- `app/api/cron/chat-alerts/route.ts`.
- `app/layout.tsx` (mount ChatGate), `components/AdminDashboard.tsx` (tab + popup poller).
- `vercel.json` (cron schedule).

## Testing (TDD, Vitest — keep suite green)
- `chat-db.test.ts` — get-or-create conversation, append + unread counters, read marking,
  close/reopen, `chatStats` aggregation.
- `api-chat.test.ts` — practitioner GET/POST (401 no session, approved gate, `?since`),
  admin GET/POST/close (401 no admin), reply flow, unread counts.
- `chat-alerts.test.ts` — alert fires once past threshold, not twice; resets on reply;
  respects `CRON_SECRET`.
- `ai-chat-insights.test.ts` — Gemini path (mocked CompleteFn) + 429/no-key fallback,
  mirroring `ai-factory.test.ts`.

## Build order
- **Phase 1 — core live chat:** migration + db helpers + practitioner widget + admin tab +
  shell popup + email backstop. Independently shippable.
- **Phase 2 — insights + FAQ report:** stats API/UI + AI consolidation.

## Deploy
Green tests + clean `npm run build`, then `npx vercel --prod --yes`. Add the cron entry to
`vercel.json`. No new env vars required (reuses `GEMINI_API_KEY(2)`, `CRON_SECRET`,
Gmail SMTP). New tables auto-create via migration on first prod connection.

## Non-goals (YAGNI)
- No anonymous/pre-login chat. No multi-agent routing or per-agent assignment (single
  shared admin). No file attachments in chat v1. No true WebSocket push (polling is the
  chosen transport). No typing indicators / read receipts beyond what unread counters give.
