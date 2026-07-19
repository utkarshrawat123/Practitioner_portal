# PRACTSESSION_HANDOFF.md

**Wild Nutrition Practitioner Hub — authoritative session handoff.** Rewritten 2026-07-17 (fresh, complete).
Repo root: `/Users/utkarshrawat/Wild Dash/practitioner-portal` (this dir holds `.git`; the parent `Wild Dash`
is NOT a git repo). Branch `main`. Live: https://practitioner-portal-rose.vercel.app · Admin: `/admin`.
**282 tests pass · production build clean · everything below is deployed.**

This file is the single source of truth for the next session. Older narrative lives in `CLAUDE.md`
(agent guide) and `PROJECT_HANDOFF.md` (early history). Detailed specs in `docs/superpowers/specs/`.

---

# 0. NEWEST SESSION (2026-07-19) — Presence "Live Now" — ✅ DONE, DEPLOYED

Admin-only Messenger-style presence in the **Live Chat** tab. Built subagent-driven (spec + plan in
`docs/superpowers/{specs,plans}/2026-07-19-presence-live-now*.md`), final review READY TO MERGE, merged to
`main`, deployed to prod, live-verified (admin/me presence endpoints 401 unauth; app 200).

- **Heartbeat:** `components/PresenceBeat.tsx` (renders null; mounted next to `ChatGate` in `app/layout.tsx`)
  POSTs `POST /api/me/presence` on mount, every 30s while the tab is focused, and on regaining focus; PAUSES
  when the tab is hidden (so "online" = actually at the portal). Writes only the caller's own row via `touchPresence`.
- **Store:** migration `015_presence` = `ALTER TABLE practitioners ADD COLUMN last_seen_at TEXT`. `touchPresence(id)`
  sets `datetime('now')`. Online = seen within `PRESENCE_WINDOW_SECONDS` (=90, exported from `lib/db.ts`, single
  source of truth — also used by the inline window in `listConversationsForAdmin`).
- **Read:** `listOnlinePractitioners(windowSeconds=90)` (approved + within window, newest-first, with open
  `conversationId` or null). `listConversationsForAdmin` gained a computed `online: boolean` per row.
  `GET /api/admin/presence` → `{ online, count }` (admin-gated).
- **Admin UI** (`components/AdminChat.tsx`, reuses its existing 2.5s poll): an **"Online now (N)"** strip +
  green/grey dot per conversation row. Clicking an online practitioner opens their thread, or starts one via
  `POST /api/admin/chat { practitionerId }` (new; reuses `getOrCreateOpenConversation`).
- **Tests:** `tests/presence-db.test.ts` (7), `tests/api-presence.test.ts` (3), +2 in `tests/api-chat.test.ts`.
  Full suite **294 pass**, build clean.
- **Git note:** this branch's first two commits are `chore: baseline …` — they committed prior deployed-but-
  uncommitted work for the touched files (db.ts, migrations.ts through 014, layout.tsx, AdminChat.tsx,
  admin/chat/route.ts, api-chat.test.ts) so presence commits stayed clean. ~68 OTHER files remain uncommitted on main.

---

# 1. THIS SESSION — acceptance checklist (done / partial / not done)

Five feature requests were handled this session. Each is broken into its acceptance criteria.

## Feature A — Welcome landing page on EVERY login (new AND existing practitioners) — ✅ DONE
- [x] Welcome takeover plays for a brand-new signup — `app/onboarding/welcome/page.tsx`, `components/WelcomeExperience.tsx`.
- [x] It ALSO plays for existing practitioners, on **every login** (not once). Was gated by the permanent
  `has_seen_welcome` flag (migration 008 had backfilled all existing rows to 1, so they never saw it).
- [x] Re-gated on a **per-login session cookie `wn_welcome`** instead of the DB flag — `lib/welcomeGate.ts`
  (`WELCOME_COOKIE`, `welcomeSeenCookieHeader()` = session cookie no Max-Age, `clearWelcomeCookieHeader()` = Max-Age=0).
- [x] Login routes CLEAR the cookie so the takeover replays: `app/api/auth/verify/route.ts` (magic link),
  `app/api/apply/route.ts` (approved-on-apply auto-login) — both `res.headers.append('Set-Cookie', clearWelcomeCookieHeader())`.
- [x] Dismissing the takeover SETS the cookie: `app/api/me/seen-welcome/route.ts` (still calls `markSeenWelcome` for analytics).
- [x] Gates read the cookie via `next/headers cookies()`: `app/dashboard/page.tsx`, `app/onboarding/welcome/page.tsx`.
- [x] Tests: `tests/welcome-gate.test.ts`. Browser-verified: existing practitioner → welcome on each login; dismissed → dashboard, no replay mid-session.

## Feature B — Live chat (admin popup + capture DB + monthly insights + FAQ consolidation) — ✅ DONE (one Hobby-plan caveat)
- [x] Practitioner floating chat bubble on every signed-in page — `components/ChatWidget.tsx`, mounted via
  `components/ChatGate.tsx` in `app/layout.tsx` (hidden on `/admin` + `/onboarding`; layout is now `async` +
  reads `getServerSessionPractitioner`). Fast polling ~2.5s. API `app/api/me/chat/route.ts`.
- [x] **"Live admin always sitting" popup** — a shell-level poller in `components/AdminDashboard.tsx` polls
  `/api/admin/chat?unread=1` every 2.5s on ANY admin tab and raises a toast + tab badge the moment a message arrives.
- [x] Admin **"Live Chat" tab (16th)** two-pane list + thread + Close/Reopen — `components/AdminChat.tsx`.
  APIs `app/api/admin/chat/route.ts` (list + `?unread=1`), `app/api/admin/chat/[id]/route.ts` (thread/reply),
  `app/api/admin/chat/[id]/close/route.ts`.
- [x] **Detailed DB for all messages/conversations** — migration `013_live_chat` (`chat_conversations`, `chat_messages`);
  helpers in `lib/db.ts`. Every message captured with sender/timestamp/read state.
- [x] **Monthly insights report + filters** — `components/ChatInsights.tsx` (Insights & FAQs sub-view). Always-on stats
  (volume, monthly trend, busiest weekday/hour, most-active practitioners, most-asked terms), date filters, CSV export.
  `app/api/admin/chat/insights/route.ts` (`lib/db chatStats` + `lib/chat/keywords.ts topKeywords`).
- [x] **FAQ consolidation** (most-asked, clustered) — `app/api/admin/chat/insights/faqs/route.ts` →
  `lib/ai/chatInsights.ts` via the Gemini seam. Degrades gracefully to "AI temporarily unavailable" on 429/no-key.
- [~] **Missed-message email backstop** — `app/api/cron/chat-alerts/route.ts` + `lib/chat/alerts.ts` (Gmail SMTP to the
  admin). Works, BUT runs **DAILY not every 5 min** because the Vercel account is Hobby (cron capped at once/day —
  a `*/5 * * * *` schedule literally fails the deploy). The instant in-app popup is unaffected; only the email
  backstop is slowed. `vercel.json` cron = `0 7 * * *`. See §6 to restore 5-min.
- [x] Tests: `tests/chat-db.test.ts`, `tests/api-chat.test.ts`, `tests/ai-chat-insights.test.ts`. Browser-verified full
  round-trip: practitioner sends → admin popup on any tab → Live Chat captures convo → admin replies → practitioner
  receives via polling → Insights shows stats/keywords + graceful AI-unavailable note.
- Spec: `docs/superpowers/specs/2026-07-16-live-chat-design.md`.

## Feature C — Ask the Expert: analyse ALL KB resources, evidence-based, cite sources, don't rely on one doc — ✅ DONE (dormant until AI key works)
- [x] Rewrote `SYSTEM_RULES` in `lib/ai/assistant.ts` to mandate: analyse ALL relevant KB docs (product dossiers +
  clinical materials), cross-reference before recommending, cite every supporting source, explain reasoning, and
  NOT assume when the KB is insufficient.
- [x] Output schema changed so single-sourcing is structurally impossible: per-item `kb_source: string` →
  **`sources: string[]`** (all supporting docs); new top-level **`sources_reviewed: string[]`** (everything analysed).
  Both the Anthropic JSON schema and the Gemini schema updated + the zod schema.
- [x] Anti-fabrication citation net in `generateProtocol` — drops any cited source that isn't a real KB document via
  new `isKnownDocument()` in `lib/ai/kb.ts` (mirrors the existing invented-product net).
- [x] UI shows all Sources + a "Resources analysed" line — `components/AssistantApp.tsx`.
- [x] Tests: `tests/ai-assistant.test.ts` (multi-source preserved + fabricated-citation dropped), plus fixture updates
  in `tests/api-assistant.test.ts`, `tests/ai-handout.test.ts`.
- [ ] **Cannot run live** — Ask the Expert needs a working AI provider and **both Gemini keys are 429 quota-exhausted**
  (same blocker as Content Factory + FAQ consolidation). Also the KB is still just **5 sample docs** in `knowledge/`.
  The new behaviour activates automatically once quota returns (or `ANTHROPIC_API_KEY` is set). See §6.

## Feature D — Student certification onboarding (email → upload → flagged → admin approve/reject) — ✅ DONE (Blob write can't run under `next dev`)
- [x] Qualified practitioners onboard unchanged. Students were already flagged `STUDENT_MANUAL`; this adds the rest.
- [x] On a student application, the pipeline **auto-emails a secure upload link** — `lib/pipeline.ts processApplication`
  calls `sendCertificationRequest` when `decision.reasonCode === 'STUDENT_MANUAL'` (student AND not a duplicate).
- [x] Secure link — `lib/certUpload.ts`: HMAC token over `SESSION_SECRET` with a `cert:` purpose prefix (can NEVER be
  replayed as a login session, and vice versa), 14-day expiry. Email template `certificationRequestEmail` in
  `lib/emails/templates.ts`. Provider order Resend > Gmail SMTP > mock.
- [x] **Upload page** `app/upload-certification/page.tsx` (server shell, reads `?token=`) →
  `components/CertificationUpload.tsx` (client: GET validates token + greets by name, POSTs the file). No login needed.
- [x] **Upload API** `app/api/certification/route.ts`: GET validates token → `{name,status,alreadyUploaded}`; POST
  validates token + type (PDF/JPG/PNG/HEIC/WebP) + size (≤10 MB) → server-side `put()` to Vercel Blob under
  `certifications/` → `setCertification` → `addEvent('certification', …)`.
- [x] **Admin Flagged detail** shows a "Student certification" block ("Open certification (filename) →" + uploaded
  timestamp, or "Not yet uploaded — student emailed a secure link") above Approve/Reject — `components/AdminDashboard.tsx`.
- [x] DB — migration `014_certifications` adds `certification_url/pathname/filename/uploaded_at` to `practitioners`;
  `setCertification` helper + `Practitioner` type fields in `lib/db.ts`.
- [x] Apply UX — flagged response carries `certificationRequested` (true for students); `components/ApplyForm.tsx`
  shows "we've emailed you a secure link to upload proof of study".
- [x] Tests: `tests/cert-upload.test.ts`, `tests/api-certification.test.ts` (mocked-Blob happy path). Browser-verified
  apply→email→upload page→(simulated upload)→admin Flagged shows Open-certification + Approve/Reject.
- [~] Real Blob write can't run under `next dev` (BLOB_READ_WRITE_TOKEN blanked locally for safety) — covered by the
  mocked-Blob unit test; works in production.

## Feature E — Coursera/MOOC learning: create a course, add lectures under it — ✅ DONE (was already built; fixed two UX dead-ends)
- [x] The feature was ALREADY fully implemented and deployed (admin CRUD, practitioner player, video embeds, CPD certs).
  The user's "not working" was two UX traps, both now fixed:
- [x] **Fix 1** — selecting a pathway defaulted the "Add session" type to "Existing lesson" with an empty dropdown (no
  standalone lessons/media yet) → dead end. Changed default to **"New training video"** so the video-title + link/upload
  fields show immediately — `components/AdminPathways.tsx` (`mod.kind` initial `'video'`). Added an empty-state hint for
  the Existing-lesson/media options.
- [x] **Fix 2** — creating a pathway left the builder on "Select a pathway to build its modules" until you found and
  clicked the new pathway in the list. Now **create auto-opens the new course's module builder** — `createPathway`
  reads `{ pathway }` from the 201 and calls `openPathway(pathway.id)`.
- [x] Verified end-to-end in browser: create course → builder opens on "New training video" → paste YouTube link →
  "Add video session" (media 201 + module 201) → practitioner `/learning` shows it by category with progress →
  course detail plays the inline embed (`youtube.com/embed/…`) with a Sessions sidebar + Mark complete + CPD cert at 100%.
- Underlying feature files (unchanged this session except AdminPathways): `app/learning/page.tsx` + `[id]/page.tsx`,
  `components/LearningCatalogue.tsx`, `components/PathwayDetail.tsx`, `lib/embed.ts`, `app/api/admin/pathways/**`,
  `app/api/me/pathways/**`, pathways/modules helpers in `lib/db.ts`.

---

# 2. DECISIONS MADE THIS SESSION THAT WEREN'T EXPLICITLY SPECIFIED

- **Welcome "every login" = per-login SESSION cookie** (`wn_welcome`), not per-visit or per-DB-flag. A session cookie
  also naturally re-shows on a new browser session — judged acceptable/desirable given the user chose "every single login".
  Kept `has_seen_welcome` column + `markSeenWelcome` for analytics/back-compat but it no longer gates display.
- **Live chat transport = fast polling ~2.5s** (chosen by the user over Pusher/Ably/Supabase). Invented the 2.5s interval.
- **One OPEN chat conversation per practitioner** (get-or-create); closing archives it, a new message reopens/creates one.
- **Chat capture popup lives at the AdminDashboard SHELL level** (not just the Live Chat tab) so it fires from any tab.
- **Missed-message threshold = 5 min** (`CHAT_ALERT_MINUTES`, invented default); alert email recipient defaults to
  `utkarshrawatofficial@gmail.com` (`ADMIN_ALERT_EMAIL` override). One email per waiting conversation (`alerted_at` dedupe).
- **Chat insights split**: always-on non-AI stats + keyword frequency (own stopword list in `lib/chat/keywords.ts`,
  counts each word once per message) PLUS optional Gemini FAQ clustering that degrades gracefully — so the report works
  today despite the Gemini quota outage.
- **Ask the Expert schema**: renamed `kb_source`→`sources` (array) and added `sources_reviewed` rather than a free-text
  citation field, to structurally force multi-sourcing. Citation net silently drops fabricated citations (loose two-way
  normalised match against doc title AND filename id).
- **Certification token**: reused `SESSION_SECRET` for HMAC but with a `cert:` purpose prefix so it can't cross-validate
  with login sessions; 14-day expiry (invented). Server-side `put()` (not the client-upload token dance) because a cert
  is a small PDF/image within the 4.5 MB serverless limit. Allowed types PDF/JPG/PNG/HEIC/WebP, size ≤10 MB (invented).
- **Cert email gated to `STUDENT_MANUAL` only** — deliberately NOT sent for duplicate-registration flags or
  qualified-but-flagged applicants (they have other paths).
- **Cert upload page keeps the global site header/footer** (didn't add it to ChromeGate's hidden routes) — harmless, gives brand context.
- **Learning UX**: made "New training video" the DEFAULT add-session type and auto-open-on-create — inferred from the
  user's "create a course and add lectures like Coursera" intent; nothing about the data model changed.
- **vercel.json cron for chat-alerts set to `0 7 * * *`** (daily) after the `*/5` deploy was rejected by the Hobby plan.

---

# 3. STACK — real vs the "Next.js/Turso" assumption (CONFIRMED, no surprises this session)

The assumed stack is the real stack. For the record, exactly what's running:
- **Next.js 14 App Router** on **Vercel** (serverless). Deploy = `npx vercel --prod --yes` (CLI already authed).
- **Vercel plan = HOBBY** ⇒ **cron jobs limited to once per day**. A sub-daily cron schedule FAILS the deploy
  ("Hobby accounts are limited to daily cron jobs"). This is the one real infra constraint that bit us this session.
- **Turso (libSQL)** via `@libsql/client` — **raw parameterised SQL, NO ORM**. Schema = the `SCHEMA` string in
  `lib/db.ts` (base tables, `CREATE TABLE IF NOT EXISTS`) + append-only `lib/migrations.ts` (001–014). Migrations run
  on first client connection. NOTE: better-sqlite3 was replaced by @libsql/client in an earlier session — every
  `lib/db.ts` fn is `async`. The libSQL client is wrapped with a `cache:'no-store'` fetch (Next.js otherwise caches
  query RESULTS → stale admin data). Do NOT reintroduce a `/tmp` DB fallback or default fetch caching.
- **AI = Google Gemini via raw REST fetch** (no SDK) — this is the notable deviation from "Anthropic by default".
  `lib/ai/assistant.ts selectProvider()` prefers Gemini when a key is set, else falls back to the dormant Anthropic
  path. Model default `gemini-2.0-flash` (`GEMINI_MODEL`), two-key fallback `GEMINI_API_KEY`→`GEMINI_API_KEY2` on 429/503.
  Used by Ask the Expert, Content Factory (`lib/ai/factory.ts`), and Chat FAQ consolidation (`lib/ai/chatInsights.ts`).
- **Email = Gmail SMTP via nodemailer** (`lib/providers/smtp.ts`) — no domain needed. Resend code exists but dormant
  (domain unverified). Mailchimp code exists, unused. Order: Resend > Gmail SMTP > Mailchimp/mock.
- **File storage = Vercel Blob** (`@vercel/blob`) — media uploads, certificates (PDF), student certifications.
- **Auth**: admin = SHA-256(ADMIN_PASSWORD) cookie `wn_admin` (`lib/adminAuth.ts`, 12h). Practitioner = HMAC-signed
  `wn_session` cookie (`lib/practitionerAuth.ts`, 30d) + 15-min magic-link tokens (`lib/magicLink.ts`).
- **Tailwind** (brand tokens ink/terracotta/cream/sage/stone/forest; heading font Gestura). **zod** validation. **Vitest** (282 tests).
- **No new npm dependencies added this session** (Gemini uses fetch; everything else reused existing deps).

---

# 4. EXACT CURRENT DB SCHEMA (as deployed, migrations 001–014)

Base tables live in `SCHEMA` (lib/db.ts); the rest are added by `lib/migrations.ts` (append-only). To re-dump live:
`SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%';`

**Base (SCHEMA in lib/db.ts):**
- `practitioners(id PK, name, email UNIQUE, register_body, register_number, qualification_status,
  tier DEFAULT 'standard', status DEFAULT 'pending', verification_json, affiliate_code UNIQUE, affiliate_link,
  pending_sync DEFAULT 0, created_at, decided_at, decided_by,` **+008** `has_seen_welcome DEFAULT 0,`
  **+014** `certification_url, certification_pathname, certification_filename, certification_uploaded_at)`
- `events(id PK, practitioner_id→practitioners, type, detail, created_at)` — the audit trail (NOT the events hub).
- `auth_tokens(token PK, practitioner_id→practitioners, expires_at, used_at)` — magic-link tokens.
- `clicks(id PK, practitioner_id→practitioners, code, created_at)` — referral click log.
- `ai_queries(id PK, practitioner_id→practitioners, profile_input, status, safety_flags, output_json,
  grounding_warnings, model, input_tokens, output_tokens, created_at)` — Ask the Expert log + rate-limit source.
- `lessons(id PK, source_file, title, summary, takeaways_json, quiz_json, topics_json, claim_flags_json,
  status DEFAULT 'draft', model, input_tokens, output_tokens, created_at, decided_at)`
- `lesson_completions(id PK, practitioner_id, lesson_id, completed_at, UNIQUE(practitioner_id, lesson_id))`
- `login_events(id PK, practitioner_id, created_at)`
- `media(id PK, title, type, description, content_kind, url, pathname, thumbnail_url, thumbnail_pathname,
  size, published DEFAULT 1, created_at)`

**Migrations 001–014:**
- **001** `orders(id PK, order_id UNIQUE, practitioner_id→practitioners, code, total REAL, currency DEFAULT 'GBP',
  financial_status, created_at, received_at)` + idx(practitioner_id), idx(code). Shopify order revenue.
- **002** `pathways(id PK, title, description, audience DEFAULT 'all', published DEFAULT 0, created_at`
  **+009** `, category, cpd_hours REAL DEFAULT 0)`;
  `pathway_modules(id PK, pathway_id→pathways, title, content_kind, content_id, position DEFAULT 0, required DEFAULT 1)`
  + idx(pathway_id). content_kind ∈ lesson|media; content_id points at a lesson or media row.
- **003** `certificates(id PK, practitioner_id→practitioners, pathway_id→pathways, issued_at, pdf_url,
  UNIQUE(practitioner_id, pathway_id))`
- **004** `toolkit_resources(id PK, title, type, description, audience DEFAULT 'all', content_kind, url, body,
  pathname, thumbnail_url, published DEFAULT 1, created_at)`. type ∈ handout|protocol|decision_tree|recipe|faq|email_template;
  content_kind ∈ file|link|text.
- **005** `hub_events(id PK, title, description, starts_at, ends_at, location, audience DEFAULT 'all', recording_url,
  published DEFAULT 1, created_at,` **+010** `event_type DEFAULT 'online', capacity)`;
  `hub_event_registrations(id PK, event_id→hub_events, practitioner_id→practitioners, registered_at,
  UNIQUE(event_id, practitioner_id))` + idx(event_id). (Named hub_events because `events` = audit trail.)
- **006** `tier_history(id PK, practitioner_id→practitioners, tier, computed_at)` + idx;
  `leaderboard_optins(practitioner_id PK→practitioners, opted_in DEFAULT 0, display_name, updated_at)`
- **007** `homepage_widgets(id PK, title, body, link_url, image_url, audience DEFAULT 'all', position DEFAULT 0,
  published DEFAULT 1, created_at)`
- **008** ALTER practitioners ADD `has_seen_welcome DEFAULT 0`; backfilled existing rows to 1.
- **009** ALTER pathways ADD `category`, `cpd_hours`; `module_completions(id PK, practitioner_id, module_id→pathway_modules,
  completed_at, UNIQUE(practitioner_id, module_id))` + idx.
- **010** ALTER hub_events ADD `event_type`, `capacity`; `community_posts(id PK, practitioner_id, author_name,
  post_type DEFAULT 'discussion', title, body, pinned DEFAULT 0, hidden DEFAULT 0, created_at)` + idx;
  `community_replies(id PK, post_id→community_posts, practitioner_id, author_name, body, hidden DEFAULT 0, created_at)` + idx;
  `community_upvotes(post_id→community_posts, practitioner_id, created_at, PRIMARY KEY(post_id, practitioner_id))`
- **011** `email_log(id PK, practitioner_id, job, period, detail, sent_at, UNIQUE(practitioner_id, job, period))`;
  `automation_runs(id PK, job, status, detail, ran_at)` + idx(job, ran_at)
- **012** `clinical_pearls(id PK, body, category, audience DEFAULT 'all', status DEFAULT 'draft', source, created_at)` + idx(status)
- **013** `chat_conversations(id PK, practitioner_id, status DEFAULT 'open', subject, created_at, updated_at,
  last_practitioner_at, last_admin_at, alerted_at)` + idx(status), idx(updated_at), idx(practitioner_id);
  `chat_messages(id PK, conversation_id→chat_conversations, sender, body, created_at, read_by_admin DEFAULT 0,
  read_by_practitioner DEFAULT 0)` + idx(conversation_id). sender ∈ practitioner|admin.
- **014** ALTER practitioners ADD `certification_url`, `certification_pathname`, `certification_filename`, `certification_uploaded_at`.
- Bookkeeping: `schema_migrations(id PK, applied_at)`.

**Total: 26 application tables** + schema_migrations. `audience` (all|qualified|student) on content tables is the single
gate via `lib/access.ts hasAccess()`.

---

# 5. ENVIRONMENT VARIABLES IN USE (no secret values)

**Set in Vercel production (live):**
- `TURSO_DATABASE_URL` — libSQL DB URL (libsql://utkarsh-utkarshraw123.aws-eu-west-1.turso.io). Durable prod DB.
- `TURSO_AUTH_TOKEN` — Turso auth token.
- `ADMIN_PASSWORD` — admin console password. **Prod value: `wild-admin-2026`.** (Dev/local: `preview-admin`.)
- `SESSION_SECRET` — HMAC secret for practitioner session cookies AND certification upload tokens.
- `PORTAL_URL` — canonical base URL (the rose URL); used to build magic-link + cert-upload URLs.
- `COMMISSION_PERCENT` — affiliate commission % (=20).
- `GMAIL_USER` — transactional sender (=utkarshrawatofficial@gmail.com). Presence flips SMTP live.
- `GMAIL_APP_PASSWORD` — Gmail app password (spaces stripped in code).
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob token (auto-provisioned in all Vercel envs; read implicitly by `@vercel/blob`).
- `CRON_SECRET` — Bearer secret guarding all `/api/cron/*` endpoints.
- `GEMINI_API_KEY` — primary Gemini key (Ask the Expert + Factory + Chat FAQ). **Currently 429 quota-exhausted.**
- `GEMINI_API_KEY2` — fallback Gemini key. **Also 429-exhausted (likely shares one Google project's quota).**

**Read by code, optional / currently UNSET (feature runs in mock/degraded mode until set):**
- `GEMINI_MODEL` — override model (default `gemini-2.0-flash`).
- `ANTHROPIC_API_KEY` — legacy AI fallback + offline lesson generation (`npm run generate-lessons`). Unset.
- `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_WEBHOOK_SECRET` — real discount codes/orders/revenue/tiers. Unset (revenue = £0, tiers all Standard). **Last remaining integration.**
- `AFFILIATE_DISCOUNT_PERCENT` — discount % on generated Shopify codes. Unset.
- `STATS_SOURCE` — `shopify-live` switches dashboard/reporting from the local `orders` table to a live Shopify query. Unset (uses local orders).
- `EMAIL_FROM` — override the From header. Unset.
- `RESEND_API_KEY` — enables the (dormant) Resend transactional sender. Unset.
- `MAILCHIMP_API_KEY`, `MAILCHIMP_AUDIENCE_ID` — Mailchimp marketing enrolment. Unset (not needed).
- `ADMIN_ALERT_EMAIL` — recipient for missed-chat-message alerts (default utkarshrawatofficial@gmail.com). Unset (uses default).
- `CHAT_ALERT_MINUTES` — minutes a chat may wait before the backstop email (default 5). Unset (uses 5).
- `KB_DIR` — override knowledge-base dir (default `knowledge/`). Unset.
- `DB_PATH` — test/local file-DB path (set by tests + `.env.development.local`). Not a prod var.
- `VERCEL`, `AWS_LAMBDA_FUNCTION_NAME` — runtime-provided serverless detection flags (do not set manually).

---

# 6. LEFT BROKEN / STUBBED / PARTIAL — and exactly how to finish

1. **Gemini 429 quota-exhausted (BLOCKS 3 features)** — Ask the Expert (`/assistant`), Content Factory, and Chat FAQ
   consolidation all reach Google but get 429 on BOTH keys. **Finish:** enable billing / raise quota on the Google
   project, OR add `GEMINI_API_KEY2` under a DIFFERENT Google account/project, OR wait for the free-tier daily reset.
   No code change needed — all three light up automatically. (Optionally set `ANTHROPIC_API_KEY` to use the dormant
   Claude path for Ask the Expert instead.)
2. **KB is still 5 SAMPLE docs** (`knowledge/`: 5 products + dosing-principles.md + contraindications.md). Ask the Expert
   only recommends/cites from these. **Finish:** replace with the real Wild Nutrition product dossiers + clinical materials
   before real use. The new multi-source/citation logic gets better the richer the KB.
3. **Chat missed-message email is DAILY, not 5-min (Vercel Hobby limit).** The instant in-app popup is unaffected.
   **Finish:** upgrade to Vercel Pro, then change `vercel.json` cron `/api/cron/chat-alerts` from `0 7 * * *` to
   `*/5 * * * *` (or as frequent as desired) and redeploy. No code change.
4. **Shopify NOT connected** — tiers stay Standard, revenue £0. **Finish:** set `SHOPIFY_STORE_DOMAIN` +
   `SHOPIFY_ADMIN_TOKEN` (+ `SHOPIFY_WEBHOOK_SECRET`), register the order webhook against the store, optionally set
   `AFFILIATE_DISCOUNT_PERCENT` and `STATS_SOURCE=shopify-live`. This is the deliberate last integration.
5. **Sentry / error monitoring NOT wired** — errors are `console.error` + logged to `ai_queries`/`automation_runs`.
   **Finish:** add `@sentry/nextjs` + a `SENTRY_DSN`.
6. **Certification / media Blob uploads can't be exercised under `next dev`** — `.env.development.local` blanks
   `BLOB_READ_WRITE_TOKEN` on purpose (so local dev never touches prod Blob). Covered by mocked-Blob unit tests; works
   in prod. To test uploads locally you'd need a real Blob token (not recommended — it writes to prod Blob).
7. **Coming-soon stubs remain** (unrelated to this session): Book Technical Consultation, Live Chat-with-a-person beyond
   the new chat, Student Mentoring, My Downloads (`/coming-soon`). **Facebook Group URL is a PLACEHOLDER** in
   `components/CommunityApp.tsx` (`FB_GROUP_URL`).
8. **Real device / mobile pass** — the chat widget + cert page + admin were dev-viewport checked, not on a real phone.

---

# 7. TEST DATA / SANDBOX / MANUAL STEPS TO REDO IF STARTING FRESH

- **All my browser verification this session used an ISOLATED LOCAL file DB**, not production. The `.env.development.local`
  (gitignored) forces `DB_PATH=/private/tmp/.../scratchpad/preview.db` and blanks TURSO + Blob, so `next dev` never
  touches prod. Test rows I created ("Gut Health Masterclass TEST"/"MOOC Course One"/"Clean Test Course" pathways,
  "Sam Student", "Chat Tester", "Lena Learner", etc.) live only in that scratch DB → **nothing to clean in prod from this session.**
- **Local dev MUST use the `portal-dev` launch config (`next dev`), NOT `portal` (`next start`)** — `portal` runs prod
  mode and would hit prod Turso. If port 3100 is busy with `portal`, stop it and start `portal-dev`. Launch configs are
  in the ROOT `Wild Dash/.claude/launch.json`. Admin password locally = `preview-admin`.
- **Vercel CLI is authed** on this machine (`vercel whoami` → utkarshrawatofficial-2811, team utkarsh-projects12).
  Deploy = `npx vercel --prod --yes` from this dir. It deploys the WHOLE working tree (not git-based) — uncommitted
  changes ship. **Check `vercel whoami` before ever claiming you can't deploy.**
- **Admin prod password = `wild-admin-2026`.** Turso web console is the way to edit prod data (the sandbox blocks prod DB writes).
- **No Shopify store connected** — nothing to re-point yet. When connecting, register the order-paid webhook →
  `app/api/webhooks/shopify` (HMAC via `SHOPIFY_WEBHOOK_SECRET`).
- **Prod test practitioners from EARLIER sessions may still exist** (henrietta/lucy + `*@example.com`). Delete before
  real launch via the Turso web console.
- **The repo has substantial pre-existing uncommitted changes** from prior sessions (many modified files). This session
  I committed only the live-chat spec doc; everything else is deployed-but-uncommitted in the working tree. If you want a
  clean git history, review `git status` and commit deliberately — do NOT blind-commit everything.

---

# 8. IF PICKING UP IN A NEW SESSION — READ THESE FIRST, IN ORDER

1. **THIS FILE** (`PRACTSESSION_HANDOFF.md`) — you're holding the authoritative state.
2. `CLAUDE.md` — architecture map, conventions, critical gotchas (no-store fetch, care@ ban, name-based verification).
3. `lib/db.ts` — the entire data layer (all async; `SCHEMA` + helpers). `lib/migrations.ts` — append-only, 001–014.
4. `lib/pipeline.ts` + `lib/decision.ts` — onboarding/approval flow (incl. student cert email hook) + `lib/certUpload.ts`.
5. `lib/ai/assistant.ts` (provider selection + Gemini + multi-source citations) & `lib/ai/kb.ts` (`isKnownDocument`).
6. `components/AdminDashboard.tsx` — the 16-tab admin shell + chat capture popper. `components/AdminChat.tsx` +
   `components/ChatInsights.tsx`. `components/AdminPathways.tsx` — the course/lecture builder (default video + auto-open).
7. `lib/welcomeGate.ts` + `app/dashboard/page.tsx` + `app/onboarding/welcome/page.tsx` — welcome-every-login gate.
8. `docs/superpowers/specs/2026-07-16-live-chat-design.md` — the one written spec from this session.
9. Env + deploy facts in §5/§7 above before touching prod.

**Commands:** `npm run dev` (→ http://localhost:3100, use `portal-dev` launch), `npm test` (282 passing — keep green),
`npm run build` (type-check gate; stop any running dev server first, it corrupts `.next` page-data collection),
`npx vercel --prod --yes` (deploy). Admin = 16 tabs. Parts 1–8 built. Only Shopify connect + Gemini quota + real KB remain.
