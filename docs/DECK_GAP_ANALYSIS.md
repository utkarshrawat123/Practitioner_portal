# Design-deck gap analysis — "Hub Ideas v2" vs what is built

Source: `Hub Ideas v 2 (7).pdf` (22 pages), supplied 2026-08-25. Analysis done by
extracting the deck's text (subset-font ToUnicode CMaps, ~85% legible) and its 26
embedded mockup JPEGs, then cross-referencing against the codebase.

> The deck is a **vision/pitch deck**, not a spec. It contains design *iterations*
> (two different sidebar treatments) and its nav differs from what is built. Treat
> it as direction, and confirm the IA questions in §5 before restructuring routes.

## 1. The deck's own structure

Five pillars — **DISCOVER · LEARN · USE IN CLINIC · CONNECT · GROW** — delivered
across three phases:

| Phase | Theme | Deck's items |
|---|---|---|
| 1 | Foundation | Platform redesign · Video welcome · Dashboard + personalisation · Learning Pathways · Clinical toolkit · Resource library |
| 2 | Engagement | Ask Lorna (intelligent search) · Search + filters · Community discussions · Events hub · My Clinic (saved resources) · Facebook group · Live Chat |
| 3 | Personalisation | Advanced personalisation · CPD tracking + certification · Mobile app · AI-powered insights · Patient area with testing + results |

Deck's stated problems with the *current* live hub (worth keeping in view): reads
like a document library not a partner; no personalisation or progression;
community/events hidden; no distinction from the consumer site; no student vs
qualified-HCP pathway; consult link takes you off the hub.

## 2. Built and matching the deck ✅

| Deck feature | Where it lives |
|---|---|
| Clinical Toolkit — handouts, protocols & dosing guides, decision trees, recipes/meal plans, FAQs, email templates | `/toolkit`, migration `004`. **All six deck types exist exactly.** |
| Learning Pathways — structured, tangible progress, CPD accredited | `/learning`, migrations `002`/`009`, `lib/certificates.ts` |
| Resource library | `/resources`, `media` table |
| Community discussions (incl. Ask-the-Expert + Member Spotlight post types) | `/community`, migration `010` |
| Events hub + registrations + ICS | `/events`, migrations `005`/`010`, `lib/events/ics.ts` |
| Live Chat (+ presence) | `ChatWidget`/`AdminChat`, migrations `013`/`015` |
| **CPD tracking & certification** | `/cpd` + certificates — the deck puts this in **Phase 3**, so the build is *ahead* here |
| Student vs qualified-HCP pathway | `lib/access.ts` audience gating (`all`/`qualified`/`student`) |
| Content Factory · Content Calendar · Clinical Pearls | Admin console — matches the deck's content-engine strategy closely |

## 3. Partial — exists, but not what the deck shows ⚠️

### 3.1 "Ask Lorna" is NOT the built "Ask the Expert"

The single most important finding. They share a concept and differ in kind:

| | Built: Ask the Expert | Deck: Ask Lorna |
|---|---|---|
| Input | a patient profile | a natural-language clinical question |
| Output | one structured **protocol** (products, dosing, rationale, handout) | a **result set** of mixed content cards |
| Card types | n/a | Clinical Guide · Webinar · Product Recommendation · Evidence Summary · FAQ · Patient Handout |
| Controls | none | "Refine search", search tips |

Both can share `lib/ai/*` and the knowledge base, but **Ask Lorna is a retrieval/search
feature that does not exist yet.** Do not assume it is done because a similarly
named page exists.

### 3.2 Other partials

| Deck feature | Gap |
|---|---|
| Video welcome from Lorna | `/onboarding/welcome` is a framer-motion *scroll* experience — no video, no Lorna |
| Events hub tabs | Deck: Upcoming / Live Online / **On Demand** / **My Events**. On-demand recordings and "breakfast clubs & networking" aren't modelled (there is a `recordingUrl` field only) |
| Pathway browse by health area | `pathways.category` exists, but no icon-grid browse (Women's, Hormone, Gut, Immune, Children's, Joint, Heart, Brain) |
| Private Facebook group | `NEXT_PUBLIC_FB_GROUP_URL` override added, but the default is still a **placeholder URL** |
| Medication support / contraindications | KB holds `contraindications.md`; there is no practitioner-facing interaction lookup |
| In-depth product knowledge | KB dossiers exist for the AI; no practitioner-facing product-knowledge browser |
| Crib sheets / technical guides | Toolkit + media can hold them; no dedicated "crib sheet" content type |

## 4. Missing entirely ❌

**Phase 1–2**
- **Global search + filters** — no cross-content search anywhere in the app
- **"My Clinic" / saved resources** — no bookmark/save model at all
- **Book a technical consultation** — a recurring deck CTA; currently a coming-soon stub
- **Student mentoring calls** — coming-soon stub
- **"Our processes"** — how WN researches/formulates/QAs (content page)
- **Notifications** — the mockups show a bell in the header; nothing exists
- **Header chrome** — global search icon + profile avatar
- **Personalisation** — no tailoring by specialism, interest or behaviour

**Community engagement (deck lists these explicitly)**
- Live Q&A sessions · Peer support · **Polls & surveys** · **NPD trials**

**Phase 3**
- Advanced personalisation
- **Native mobile app** — deck shows an iOS app with a bottom tab bar (Home/Explore/Search/Library/Ask Lorna). Built app is responsive web only.
- **AI-powered insights**
- **Patient area with testing & results** — the largest single piece of unbuilt scope, and it carries health-data/consent implications that need a separate conversation before any build.

## 5. Built but NOT in the deck — needs a product decision 🔵

These are real, working commercial features the deck never mentions:

- **Patient Carts** — curated cart → tokenised login-free pay link → attributed sale
- **Referral network v2** — £50 practitioner referrals, paid-only credit, refund clawback, caps, optional approval
- **Leaderboard**
- **Affiliate / commission tracking** (dashboard + reporting)

Meanwhile the deck's sidebar shows **Practice Growth** and **My Patients / My Clinic**,
which the build does not have. Two readings:

1. Those deck slots are where Carts/Referrals belong under new names → then this is a
   *rename + regroup*, not new work.
2. The deck predates those features → then someone must decide whether they stay,
   and where they sit in the new IA.

**This must be answered before the navigation is restructured.** Restyling is safe;
renaming/moving routes is a product change.

## 6. Suggested build order

Cheapest-first, each unlocking the next:

1. **Saved resources / "My Clinic"** — small, high perceived value, fills a deck nav slot
2. **Global search + filters** — prerequisite for Ask Lorna anyway
3. **Ask Lorna search** — reuses the KB and the existing AI seam; retrieval layer is the new part
4. **Events: On Demand + My Events tabs** — mostly UI over data that already exists
5. **Consultation + mentoring booking** — retires two coming-soon stubs
6. **Notifications + header chrome**
7. **Community: polls/surveys, NPD trials**
8. Later, and deliberately so: native mobile app; patient testing area.
