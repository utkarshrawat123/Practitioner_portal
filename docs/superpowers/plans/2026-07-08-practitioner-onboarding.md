# Wild Nutrition Practitioner Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automated practitioner application pipeline — branded apply form → register verification with confidence scoring → auto-approve/flag decision → affiliate code + referral link → SQLite record → welcome email, plus a password-protected admin review queue.

**Architecture:** Single Next.js 14 App Router app. Pure-logic modules in `lib/` (decision engine, code generator, SQLite access, register adapters, provider adapters) orchestrated by `lib/pipeline.ts`; thin API routes; two pages (`/apply` public, `/admin` protected). External providers (Shopify, Mailchimp) sit behind interfaces with mock implementations selected automatically when env credentials are absent.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, better-sqlite3, zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-08-practitioner-onboarding-design.md`

## Global Constraints

- Project root: `/Users/utkarshrawat/Wild Dash/practitioner-portal` (all paths below relative to it). Never touch `../wild-dash`.
- Branding: headings `Gestura, Georgia, serif`; body `Basis, system-ui, sans-serif`. Do NOT bundle font files (licensed). Palette: ink `#191919`, ink2 `#222222`, terracotta `#a45248`, cream `#f8f6f3`, sage `#d0d1ab`, stone `#e6e3df`, forest `#3a4f41`.
- Registers: exactly `BANT`, `CNHC`, `NNA`, `ANP`.
- Affiliate code format: `WN-{SURNAME≤6}-{4 chars from ABCDEFGHJKMNPQRSTVWXYZ23456789}`.
- Referral link: `https://www.wildnutrition.com/discount/{CODE}?utm_source=practitioner&utm_medium=referral&utm_campaign={CODE}`.
- Register lookups: single request per application, ≥1s spacing, 8s timeout, User-Agent `WildNutritionPractitionerPortal/1.0 (+care@wildnutrition.com; membership verification)`. Any failure → `unavailable`, never a thrown error.
- External provider failure never loses an approval: record stays `approved` with `pending_sync=1`.
- Env vars: `DB_PATH`, `ADMIN_PASSWORD`, `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN`, `AFFILIATE_DISCOUNT_PERCENT`, `MAILCHIMP_API_KEY`, `MAILCHIMP_AUDIENCE_ID`. Missing Shopify/Mailchimp vars → mock providers.
- Commit after every green task. TDD: test first, watch it fail, then implement.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.js`, `vitest.config.ts`, `.gitignore`, `.env.example`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`

**Interfaces:**
- Produces: Tailwind theme tokens `ink, ink2, terracotta, cream, sage, stone, forest`; font utilities `font-heading`, `font-body`; working `npm test` and `npm run build`.

- [ ] **Step 1: Write config files**

`package.json`:
```json
{
  "name": "wn-practitioner-portal",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3100",
    "build": "next build",
    "start": "next start -p 3100",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "next": "^14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.6",
    "typescript": "^5.5.3",
    "vitest": "^2.0.4"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

`tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#191919',
        ink2: '#222222',
        terracotta: '#a45248',
        cream: '#f8f6f3',
        sage: '#d0d1ab',
        stone: '#e6e3df',
        forest: '#3a4f41',
      },
      fontFamily: {
        heading: ['Gestura', 'Georgia', 'serif'],
        body: ['Basis', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
```

`postcss.config.js`:
```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname) } },
});
```

`.gitignore`:
```
node_modules/
.next/
data/
.env*.local
.env
tsconfig.tsbuildinfo
```

`.env.example`:
```
# Path to SQLite file (default: data/practitioners.db)
DB_PATH=
# Password for /admin
ADMIN_PASSWORD=change-me
# Shopify Admin API — leave blank to run the affiliate step in mock mode
SHOPIFY_STORE_DOMAIN=
SHOPIFY_ADMIN_TOKEN=
AFFILIATE_DISCOUNT_PERCENT=10
# Mailchimp — leave blank to run the email step in mock mode
MAILCHIMP_API_KEY=
MAILCHIMP_AUDIENCE_ID=
```

- [ ] **Step 2: Write app shell**

`app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --font-family-gestura: Gestura, Georgia, serif;
  --font-paragraph--family: Basis, system-ui, sans-serif;
}

body {
  @apply bg-cream text-ink2 font-body antialiased;
}
```

`app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Practitioner Community | Wild Nutrition',
  description:
    'Join the Wild Nutrition expert practitioner community — apply for your practitioner account.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-stone bg-cream">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
            <a href="/apply" className="font-heading text-2xl tracking-wide text-ink">
              Wild Nutrition<sup className="text-xs align-super">®</sup>
            </a>
            <span className="text-xs uppercase tracking-[0.2em] text-ink2">
              Practitioner Community
            </span>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-24 border-t border-stone bg-forest text-cream">
          <div className="mx-auto max-w-5xl px-6 py-10 text-sm">
            <p className="font-heading text-lg">Wild Nutrition® Ltd</p>
            <p className="mt-2 opacity-80">
              Questions? Contact our practitioner team at care@wildnutrition.com
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
```

`app/page.tsx`:
```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/apply');
}
```

- [ ] **Step 3: Install and verify build**

Run: `npm install && npm run build`
Expected: build succeeds ("Compiled successfully", routes `/` and `/apply` may warn until Task 8 — at this point only `/` exists; build must exit 0).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: scaffold Next.js app with Wild Nutrition brand tokens"
```

---

### Task 2: Affiliate code + referral link generator

**Files:**
- Create: `lib/codes.ts`
- Test: `tests/codes.test.ts`

**Interfaces:**
- Produces: `generateCode(fullName: string, isTaken: (code: string) => boolean): string`; `referralLink(code: string): string`.

- [ ] **Step 1: Write the failing test**

`tests/codes.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { generateCode, referralLink } from '@/lib/codes';

describe('generateCode', () => {
  it('formats as WN-SURNAME-XXXX', () => {
    const code = generateCode('Jane Smith', () => false);
    expect(code).toMatch(/^WN-SMITH-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{4}$/);
  });

  it('truncates long surnames to 6 chars and strips non-letters', () => {
    const code = generateCode("Ana O'Sullivan-Brown", () => false);
    expect(code).toMatch(/^WN-[A-Z]{1,6}-[A-Z2-9]{4}$/);
    expect(code.split('-')[1].length).toBeLessThanOrEqual(6);
  });

  it('uses fallback when name has no usable surname', () => {
    const code = generateCode('  超 ', () => false);
    expect(code).toMatch(/^WN-PRACT-[A-Z2-9]{4}$/);
  });

  it('retries on collision', () => {
    let calls = 0;
    const code = generateCode('Jane Smith', () => ++calls <= 2);
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(code).toMatch(/^WN-SMITH-/);
  });

  it('throws after exhausting attempts', () => {
    expect(() => generateCode('Jane Smith', () => true)).toThrow(/unique/i);
  });
});

describe('referralLink', () => {
  it('builds discount URL with UTM params', () => {
    expect(referralLink('WN-SMITH-AB2C')).toBe(
      'https://www.wildnutrition.com/discount/WN-SMITH-AB2C?utm_source=practitioner&utm_medium=referral&utm_campaign=WN-SMITH-AB2C'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codes.test.ts`
Expected: FAIL — cannot resolve `@/lib/codes`.

- [ ] **Step 3: Write minimal implementation**

`lib/codes.ts`:
```ts
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // no 0/O/1/I/L ambiguity
const MAX_ATTEMPTS = 50;

export function generateCode(
  fullName: string,
  isTaken: (code: string) => boolean
): string {
  const parts = fullName.trim().toUpperCase().split(/\s+/);
  const rawSurname = parts[parts.length - 1] ?? '';
  const surname = rawSurname.replace(/[^A-Z]/g, '').slice(0, 6) || 'PRACT';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    const code = `WN-${surname}-${suffix}`;
    if (!isTaken(code)) return code;
  }
  throw new Error('Could not generate a unique affiliate code');
}

export function referralLink(code: string): string {
  return `https://www.wildnutrition.com/discount/${code}?utm_source=practitioner&utm_medium=referral&utm_campaign=${code}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codes.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/codes.ts tests/codes.test.ts && git commit -m "feat: affiliate code generator and referral link builder"
```

---

### Task 3: SQLite data layer

**Files:**
- Create: `lib/db.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces (all exported from `lib/db.ts`):
```ts
type QualificationStatus = 'qualified' | 'student';
type Status = 'pending' | 'approved' | 'flagged' | 'rejected';
interface Verification {
  reasonCode: string;
  confidence: string | null;
  detail: string;
  manualSearchUrl: string;
}
interface Practitioner {
  id: number; name: string; email: string; registerBody: string;
  registerNumber: string; qualificationStatus: QualificationStatus;
  tier: string; status: Status; verification: Verification | null;
  affiliateCode: string | null; affiliateLink: string | null;
  pendingSync: boolean; createdAt: string;
  decidedAt: string | null; decidedBy: string | null;
}
getDb(): Database                    // singleton, DB_PATH env or data/practitioners.db
resetDbForTests(): void              // close + clear singleton
insertApplication(input: { name; email; registerBody; registerNumber; qualificationStatus }): Practitioner
getPractitioner(id: number): Practitioner | null
findByEmail(email: string): Practitioner | null
hasDuplicateRegistration(registerBody: string, registerNumber: string, excludeId: number): boolean
flagPractitioner(id: number, verification: Verification): Practitioner
markApproved(id, { verification?: Verification; affiliateCode; affiliateLink; pendingSync; decidedBy }): Practitioner
markRejected(id: number, decidedBy: string): Practitioner
setPendingSync(id: number, pending: boolean): void
isCodeTaken(code: string): boolean
listPractitioners(status?: Status): Practitioner[]
addEvent(practitionerId: number, type: string, detail: string): void
listEvents(practitionerId: number): { id; practitionerId; type; detail; createdAt }[]
```

- [ ] **Step 1: Write the failing test**

`tests/db.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-db-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});

afterEach(async () => {
  const db = await import('@/lib/db');
  db.resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

const sample = {
  name: 'Jane Smith',
  email: 'jane@example.com',
  registerBody: 'BANT',
  registerNumber: '12345',
  qualificationStatus: 'qualified' as const,
};

describe('db', () => {
  it('inserts and reads an application with defaults', async () => {
    const { insertApplication, getPractitioner } = await import('@/lib/db');
    const p = insertApplication(sample);
    expect(p.id).toBeGreaterThan(0);
    expect(p.status).toBe('pending');
    expect(p.tier).toBe('standard');
    expect(p.pendingSync).toBe(false);
    expect(getPractitioner(p.id)?.email).toBe('jane@example.com');
  });

  it('finds by email and detects duplicate registrations', async () => {
    const { insertApplication, findByEmail, hasDuplicateRegistration } =
      await import('@/lib/db');
    const p = insertApplication(sample);
    expect(findByEmail('jane@example.com')?.id).toBe(p.id);
    expect(findByEmail('nobody@example.com')).toBeNull();
    expect(hasDuplicateRegistration('BANT', '12345', 999)).toBe(true);
    expect(hasDuplicateRegistration('BANT', '12345', p.id)).toBe(false);
    expect(hasDuplicateRegistration('CNHC', '12345', 999)).toBe(false);
  });

  it('flags with verification json round-trip', async () => {
    const { insertApplication, flagPractitioner } = await import('@/lib/db');
    const p = insertApplication(sample);
    const v = {
      reasonCode: 'NO_MATCH',
      confidence: 'none',
      detail: 'not found',
      manualSearchUrl: 'https://example.com',
    };
    const flagged = flagPractitioner(p.id, v);
    expect(flagged.status).toBe('flagged');
    expect(flagged.verification).toEqual(v);
    expect(flagged.decidedBy).toBe('system');
  });

  it('marks approved with code and pending sync', async () => {
    const { insertApplication, markApproved, isCodeTaken } = await import('@/lib/db');
    const p = insertApplication(sample);
    const a = markApproved(p.id, {
      affiliateCode: 'WN-SMITH-AB2C',
      affiliateLink: 'https://example.com/x',
      pendingSync: true,
      decidedBy: 'system',
    });
    expect(a.status).toBe('approved');
    expect(a.pendingSync).toBe(true);
    expect(isCodeTaken('WN-SMITH-AB2C')).toBe(true);
    expect(isCodeTaken('WN-OTHER-XX22')).toBe(false);
  });

  it('rejects, lists by status, and records events', async () => {
    const { insertApplication, markRejected, listPractitioners, addEvent, listEvents } =
      await import('@/lib/db');
    const p1 = insertApplication(sample);
    insertApplication({ ...sample, email: 'b@example.com', registerNumber: '99' });
    markRejected(p1.id, 'admin');
    expect(listPractitioners('rejected').map((x) => x.id)).toEqual([p1.id]);
    expect(listPractitioners()).toHaveLength(2);
    addEvent(p1.id, 'decision', 'rejected by admin');
    expect(listEvents(p1.id)[0].detail).toBe('rejected by admin');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL — cannot resolve `@/lib/db`.

- [ ] **Step 3: Write implementation**

`lib/db.ts`:
```ts
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export type QualificationStatus = 'qualified' | 'student';
export type Status = 'pending' | 'approved' | 'flagged' | 'rejected';

export interface Verification {
  reasonCode: string;
  confidence: string | null;
  detail: string;
  manualSearchUrl: string;
}

export interface Practitioner {
  id: number;
  name: string;
  email: string;
  registerBody: string;
  registerNumber: string;
  qualificationStatus: QualificationStatus;
  tier: string;
  status: Status;
  verification: Verification | null;
  affiliateCode: string | null;
  affiliateLink: string | null;
  pendingSync: boolean;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface EventRow {
  id: number;
  practitionerId: number;
  type: string;
  detail: string;
  createdAt: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS practitioners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  register_body TEXT NOT NULL,
  register_number TEXT NOT NULL,
  qualification_status TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'pending',
  verification_json TEXT,
  affiliate_code TEXT UNIQUE,
  affiliate_link TEXT,
  pending_sync INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  decided_by TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  type TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'practitioners.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(SCHEMA);
  }
  return db;
}

export function resetDbForTests(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function rowToPractitioner(row: any): Practitioner {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    registerBody: row.register_body,
    registerNumber: row.register_number,
    qualificationStatus: row.qualification_status,
    tier: row.tier,
    status: row.status,
    verification: row.verification_json ? JSON.parse(row.verification_json) : null,
    affiliateCode: row.affiliate_code,
    affiliateLink: row.affiliate_link,
    pendingSync: row.pending_sync === 1,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
  };
}

export function insertApplication(input: {
  name: string;
  email: string;
  registerBody: string;
  registerNumber: string;
  qualificationStatus: QualificationStatus;
}): Practitioner {
  const res = getDb()
    .prepare(
      `INSERT INTO practitioners (name, email, register_body, register_number, qualification_status)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(input.name, input.email, input.registerBody, input.registerNumber, input.qualificationStatus);
  return getPractitioner(Number(res.lastInsertRowid))!;
}

export function getPractitioner(id: number): Practitioner | null {
  const row = getDb().prepare(`SELECT * FROM practitioners WHERE id = ?`).get(id);
  return row ? rowToPractitioner(row) : null;
}

export function findByEmail(email: string): Practitioner | null {
  const row = getDb()
    .prepare(`SELECT * FROM practitioners WHERE email = ? COLLATE NOCASE`)
    .get(email);
  return row ? rowToPractitioner(row) : null;
}

export function hasDuplicateRegistration(
  registerBody: string,
  registerNumber: string,
  excludeId: number
): boolean {
  const row = getDb()
    .prepare(
      `SELECT id FROM practitioners
       WHERE register_body = ? AND register_number = ? COLLATE NOCASE AND id != ?`
    )
    .get(registerBody, registerNumber, excludeId);
  return !!row;
}

export function flagPractitioner(id: number, verification: Verification): Practitioner {
  getDb()
    .prepare(
      `UPDATE practitioners
       SET status = 'flagged', verification_json = ?, decided_at = datetime('now'), decided_by = 'system'
       WHERE id = ?`
    )
    .run(JSON.stringify(verification), id);
  return getPractitioner(id)!;
}

export function markApproved(
  id: number,
  opts: {
    verification?: Verification;
    affiliateCode: string;
    affiliateLink: string;
    pendingSync: boolean;
    decidedBy: string;
  }
): Practitioner {
  const existing = getPractitioner(id)!;
  const verification = opts.verification ?? existing.verification;
  getDb()
    .prepare(
      `UPDATE practitioners
       SET status = 'approved', verification_json = ?, affiliate_code = ?, affiliate_link = ?,
           pending_sync = ?, decided_at = datetime('now'), decided_by = ?
       WHERE id = ?`
    )
    .run(
      verification ? JSON.stringify(verification) : null,
      opts.affiliateCode,
      opts.affiliateLink,
      opts.pendingSync ? 1 : 0,
      opts.decidedBy,
      id
    );
  return getPractitioner(id)!;
}

export function markRejected(id: number, decidedBy: string): Practitioner {
  getDb()
    .prepare(
      `UPDATE practitioners
       SET status = 'rejected', decided_at = datetime('now'), decided_by = ?
       WHERE id = ?`
    )
    .run(decidedBy, id);
  return getPractitioner(id)!;
}

export function setPendingSync(id: number, pending: boolean): void {
  getDb().prepare(`UPDATE practitioners SET pending_sync = ? WHERE id = ?`).run(pending ? 1 : 0, id);
}

export function isCodeTaken(code: string): boolean {
  return !!getDb().prepare(`SELECT id FROM practitioners WHERE affiliate_code = ?`).get(code);
}

export function listPractitioners(status?: Status): Practitioner[] {
  const rows = status
    ? getDb().prepare(`SELECT * FROM practitioners WHERE status = ? ORDER BY created_at DESC, id DESC`).all(status)
    : getDb().prepare(`SELECT * FROM practitioners ORDER BY created_at DESC, id DESC`).all();
  return rows.map(rowToPractitioner);
}

export function addEvent(practitionerId: number, type: string, detail: string): void {
  getDb()
    .prepare(`INSERT INTO events (practitioner_id, type, detail) VALUES (?, ?, ?)`)
    .run(practitionerId, type, detail);
}

export function listEvents(practitionerId: number): EventRow[] {
  return getDb()
    .prepare(`SELECT * FROM events WHERE practitioner_id = ? ORDER BY id DESC`)
    .all(practitionerId)
    .map((r: any) => ({
      id: r.id,
      practitionerId: r.practitioner_id,
      type: r.type,
      detail: r.detail,
      createdAt: r.created_at,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts tests/db.test.ts && git commit -m "feat: SQLite data layer with practitioners and audit events"
```

---

### Task 4: Decision engine

**Files:**
- Create: `lib/decision.ts`
- Test: `tests/decision.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
```ts
type Confidence = 'high' | 'partial' | 'none' | 'unavailable';
type ReasonCode = 'AUTO_MATCH' | 'PARTIAL_MATCH' | 'NO_MATCH'
  | 'DIRECTORY_UNAVAILABLE' | 'STUDENT_MANUAL' | 'DUPLICATE';
interface Decision { status: 'approved' | 'flagged'; reasonCode: ReasonCode; }
decide(input: {
  qualificationStatus: 'qualified' | 'student';
  confidence: Confidence | null;   // null when lookup skipped (student/duplicate)
  isDuplicate: boolean;
}): Decision
```

- [ ] **Step 1: Write the failing test**

`tests/decision.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { decide } from '@/lib/decision';

describe('decide', () => {
  it('auto-approves qualified high-confidence matches', () => {
    expect(decide({ qualificationStatus: 'qualified', confidence: 'high', isDuplicate: false }))
      .toEqual({ status: 'approved', reasonCode: 'AUTO_MATCH' });
  });

  it('flags partial matches', () => {
    expect(decide({ qualificationStatus: 'qualified', confidence: 'partial', isDuplicate: false }))
      .toEqual({ status: 'flagged', reasonCode: 'PARTIAL_MATCH' });
  });

  it('flags no-match', () => {
    expect(decide({ qualificationStatus: 'qualified', confidence: 'none', isDuplicate: false }))
      .toEqual({ status: 'flagged', reasonCode: 'NO_MATCH' });
  });

  it('flags when the directory is unavailable', () => {
    expect(decide({ qualificationStatus: 'qualified', confidence: 'unavailable', isDuplicate: false }))
      .toEqual({ status: 'flagged', reasonCode: 'DIRECTORY_UNAVAILABLE' });
  });

  it('always flags students, even with a high match', () => {
    expect(decide({ qualificationStatus: 'student', confidence: 'high', isDuplicate: false }))
      .toEqual({ status: 'flagged', reasonCode: 'STUDENT_MANUAL' });
    expect(decide({ qualificationStatus: 'student', confidence: null, isDuplicate: false }))
      .toEqual({ status: 'flagged', reasonCode: 'STUDENT_MANUAL' });
  });

  it('duplicate wins over everything', () => {
    expect(decide({ qualificationStatus: 'qualified', confidence: 'high', isDuplicate: true }))
      .toEqual({ status: 'flagged', reasonCode: 'DUPLICATE' });
    expect(decide({ qualificationStatus: 'student', confidence: null, isDuplicate: true }))
      .toEqual({ status: 'flagged', reasonCode: 'DUPLICATE' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/decision.test.ts`
Expected: FAIL — cannot resolve `@/lib/decision`.

- [ ] **Step 3: Write implementation**

`lib/decision.ts`:
```ts
export type Confidence = 'high' | 'partial' | 'none' | 'unavailable';

export type ReasonCode =
  | 'AUTO_MATCH'
  | 'PARTIAL_MATCH'
  | 'NO_MATCH'
  | 'DIRECTORY_UNAVAILABLE'
  | 'STUDENT_MANUAL'
  | 'DUPLICATE';

export interface Decision {
  status: 'approved' | 'flagged';
  reasonCode: ReasonCode;
}

export interface DecisionInput {
  qualificationStatus: 'qualified' | 'student';
  confidence: Confidence | null;
  isDuplicate: boolean;
}

export function decide(input: DecisionInput): Decision {
  if (input.isDuplicate) return { status: 'flagged', reasonCode: 'DUPLICATE' };
  if (input.qualificationStatus === 'student') {
    return { status: 'flagged', reasonCode: 'STUDENT_MANUAL' };
  }
  switch (input.confidence) {
    case 'high':
      return { status: 'approved', reasonCode: 'AUTO_MATCH' };
    case 'partial':
      return { status: 'flagged', reasonCode: 'PARTIAL_MATCH' };
    case 'none':
      return { status: 'flagged', reasonCode: 'NO_MATCH' };
    default:
      return { status: 'flagged', reasonCode: 'DIRECTORY_UNAVAILABLE' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/decision.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/decision.ts tests/decision.test.ts && git commit -m "feat: pure decision engine with reason codes"
```

---

### Task 5: Register adapters (BANT, CNHC, NNA, ANP)

**Files:**
- Create: `lib/registers/types.ts`, `lib/registers/http.ts`, `lib/registers/index.ts`
- Test: `tests/registers.test.ts`

**Interfaces:**
- Consumes: `Confidence` from `lib/decision`.
- Produces:
```ts
// lib/registers/types.ts
type RegisterId = 'BANT' | 'CNHC' | 'NNA' | 'ANP';
interface LookupResult { confidence: Confidence; detail: string; }
interface RegisterAdapter {
  id: RegisterId;
  label: string;
  lookup(name: string, registerNumber: string): Promise<LookupResult>;
  manualSearchUrl(name: string): string;
}
// lib/registers/index.ts
const registers: RegisterAdapter[];
getRegister(id: string): RegisterAdapter | null;
// lib/registers/http.ts
politeFetch(url: string): Promise<string | null>;
scoreNameMatch(html: string, fullName: string): 'high' | 'partial' | 'none';
```

- [ ] **Step 1: Write the failing test**

`tests/registers.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { scoreNameMatch } from '@/lib/registers/http';
import { getRegister, registers } from '@/lib/registers';

afterEach(() => vi.unstubAllGlobals());

describe('scoreNameMatch', () => {
  it('high when full name appears (case/whitespace-insensitive, tags stripped)', () => {
    const html = '<div class="card"><b>Jane</b>   <i>Smith</i>, DipION</div>';
    expect(scoreNameMatch(html, ' jane SMITH ')).toBe('high');
  });

  it('partial when only surname appears', () => {
    expect(scoreNameMatch('<p>Dr A. Smith — London</p>', 'Jane Smith')).toBe('partial');
  });

  it('none when nothing matches; short surnames never partial-match', () => {
    expect(scoreNameMatch('<p>No practitioners found</p>', 'Jane Smith')).toBe('none');
    expect(scoreNameMatch('<p>welcome to our directory</p>', 'Li Wu')).toBe('none');
  });
});

describe('register registry', () => {
  it('exposes exactly BANT, CNHC, NNA, ANP', () => {
    expect(registers.map((r) => r.id).sort()).toEqual(['ANP', 'BANT', 'CNHC', 'NNA']);
    expect(getRegister('BANT')?.label).toContain('BANT');
    expect(getRegister('XYZ')).toBeNull();
  });

  it('every adapter produces an absolute manual search URL', () => {
    for (const r of registers) {
      expect(r.manualSearchUrl('Jane Smith')).toMatch(/^https:\/\//);
    }
  });
});

describe('adapter lookup', () => {
  it('returns high confidence when directory HTML contains the name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<div>Jane Smith</div>', { status: 200 })));
    const result = await getRegister('BANT')!.lookup('Jane Smith', '12345');
    expect(result.confidence).toBe('high');
    expect(result.detail).toContain('BANT');
  });

  it('returns unavailable when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const result = await getRegister('CNHC')!.lookup('Jane Smith', '12345');
    expect(result.confidence).toBe('unavailable');
  });

  it('returns unavailable on non-200 responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('blocked', { status: 403 })));
    const result = await getRegister('NNA')!.lookup('Jane Smith', '12345');
    expect(result.confidence).toBe('unavailable');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/registers.test.ts`
Expected: FAIL — cannot resolve `@/lib/registers/http`.

- [ ] **Step 3: Write implementation**

`lib/registers/types.ts`:
```ts
import type { Confidence } from '@/lib/decision';

export type RegisterId = 'BANT' | 'CNHC' | 'NNA' | 'ANP';

export interface LookupResult {
  confidence: Confidence;
  detail: string;
}

export interface RegisterAdapter {
  id: RegisterId;
  label: string;
  /** Single polite name-based lookup against the register's public directory. */
  lookup(name: string, registerNumber: string): Promise<LookupResult>;
  /** Directory URL a human reviewer can open to verify manually. */
  manualSearchUrl(name: string): string;
}
```

`lib/registers/http.ts`:
```ts
const USER_AGENT =
  'WildNutritionPractitionerPortal/1.0 (+care@wildnutrition.com; membership verification)';
const MIN_INTERVAL_MS = 1000;
const TIMEOUT_MS = 8000;

let lastRequestAt = 0;

/** Rate-limited, identified, time-limited GET. Returns HTML or null on any failure. */
export async function politeFetch(url: string): Promise<string | null> {
  const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export function scoreNameMatch(html: string, fullName: string): 'high' | 'partial' | 'none' {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  const name = fullName.trim().replace(/\s+/g, ' ').toLowerCase();
  if (name && text.includes(name)) return 'high';
  const parts = name.split(' ');
  const surname = parts[parts.length - 1] ?? '';
  if (surname.length >= 4 && text.includes(surname)) return 'partial';
  return 'none';
}
```

`lib/registers/index.ts`:
```ts
import { politeFetch, scoreNameMatch } from './http';
import type { LookupResult, RegisterAdapter, RegisterId } from './types';

function makeAdapter(opts: {
  id: RegisterId;
  label: string;
  searchUrl: (name: string) => string;
  manualUrl: (name: string) => string;
}): RegisterAdapter {
  return {
    id: opts.id,
    label: opts.label,
    manualSearchUrl: opts.manualUrl,
    async lookup(name: string, _registerNumber: string): Promise<LookupResult> {
      const html = await politeFetch(opts.searchUrl(name));
      if (html === null) {
        return {
          confidence: 'unavailable',
          detail: `${opts.id} directory could not be reached — verify manually.`,
        };
      }
      const confidence = scoreNameMatch(html, name);
      return {
        confidence,
        detail: `Name search against the public ${opts.id} directory returned confidence "${confidence}". Register numbers are not publicly searchable on ${opts.id}.`,
      };
    },
  };
}

export const registers: RegisterAdapter[] = [
  makeAdapter({
    id: 'BANT',
    label: 'BANT — British Association for Nutrition and Lifestyle Medicine',
    searchUrl: (n) => `https://practitioner-search.bant.org.uk/?search=${encodeURIComponent(n)}`,
    manualUrl: (n) => `https://practitioner-search.bant.org.uk/?search=${encodeURIComponent(n)}`,
  }),
  makeAdapter({
    id: 'CNHC',
    label: 'CNHC — Complementary & Natural Healthcare Council',
    searchUrl: (n) => `https://search.cnhcregister.org.uk/?name=${encodeURIComponent(n)}`,
    manualUrl: () => 'https://search.cnhcregister.org.uk/',
  }),
  makeAdapter({
    id: 'NNA',
    label: 'NNA — Naturopathic Nutrition Association',
    searchUrl: () => 'https://www.nna-uk.com/find-a-therapist',
    manualUrl: () => 'https://www.nna-uk.com/find-a-therapist',
  }),
  makeAdapter({
    id: 'ANP',
    label: 'ANP — Association of Naturopathic Practitioners',
    searchUrl: () => 'https://theanp.co.uk/member-directory/',
    manualUrl: () => 'https://theanp.co.uk/member-directory/',
  }),
];

export function getRegister(id: string): RegisterAdapter | null {
  return registers.find((r) => r.id === id) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/registers.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/registers tests/registers.test.ts && git commit -m "feat: register adapters with polite directory lookup and match scoring"
```

---

### Task 6: Affiliate + email providers (mock and live)

**Files:**
- Create: `lib/providers/types.ts`, `lib/providers/affiliates.ts`, `lib/providers/email.ts`
- Test: `tests/providers.test.ts`

**Interfaces:**
- Produces:
```ts
// lib/providers/types.ts
interface SyncResult { ok: boolean; detail: string; }
interface AffiliateProvider {
  name: string;
  createAffiliate(input: { code: string; name: string; email: string }): Promise<SyncResult>;
}
interface EmailProvider {
  name: string;
  sendWelcome(input: { name: string; email: string; code: string; link: string }): Promise<SyncResult>;
}
// lib/providers/affiliates.ts
getAffiliateProvider(): AffiliateProvider   // shopify if SHOPIFY_STORE_DOMAIN+SHOPIFY_ADMIN_TOKEN set, else mock
// lib/providers/email.ts
getEmailProvider(): EmailProvider           // mailchimp if MAILCHIMP_API_KEY+MAILCHIMP_AUDIENCE_ID set, else mock
```

- [ ] **Step 1: Write the failing test**

`tests/providers.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getAffiliateProvider } from '@/lib/providers/affiliates';
import { getEmailProvider } from '@/lib/providers/email';

beforeEach(() => {
  delete process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_ADMIN_TOKEN;
  delete process.env.MAILCHIMP_API_KEY;
  delete process.env.MAILCHIMP_AUDIENCE_ID;
});
afterEach(() => vi.unstubAllGlobals());

describe('provider selection', () => {
  it('falls back to mocks without credentials', () => {
    expect(getAffiliateProvider().name).toBe('mock');
    expect(getEmailProvider().name).toBe('mock');
  });

  it('selects live providers when credentials exist', () => {
    process.env.SHOPIFY_STORE_DOMAIN = 'example.myshopify.com';
    process.env.SHOPIFY_ADMIN_TOKEN = 'shpat_test';
    process.env.MAILCHIMP_API_KEY = 'key-us21';
    process.env.MAILCHIMP_AUDIENCE_ID = 'abc123';
    expect(getAffiliateProvider().name).toBe('shopify');
    expect(getEmailProvider().name).toBe('mailchimp');
  });
});

describe('mock providers', () => {
  it('mock affiliate succeeds and echoes the code', async () => {
    const res = await getAffiliateProvider().createAffiliate({
      code: 'WN-SMITH-AB2C', name: 'Jane Smith', email: 'jane@example.com',
    });
    expect(res.ok).toBe(true);
    expect(res.detail).toContain('WN-SMITH-AB2C');
  });

  it('mock email succeeds and echoes the recipient', async () => {
    const res = await getEmailProvider().sendWelcome({
      name: 'Jane Smith', email: 'jane@example.com',
      code: 'WN-SMITH-AB2C', link: 'https://example.com',
    });
    expect(res.ok).toBe(true);
    expect(res.detail).toContain('jane@example.com');
  });
});

describe('live providers degrade gracefully', () => {
  it('shopify returns ok=false on API failure (never throws)', async () => {
    process.env.SHOPIFY_STORE_DOMAIN = 'example.myshopify.com';
    process.env.SHOPIFY_ADMIN_TOKEN = 'shpat_test';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
    const res = await getAffiliateProvider().createAffiliate({
      code: 'WN-SMITH-AB2C', name: 'Jane Smith', email: 'jane@example.com',
    });
    expect(res.ok).toBe(false);
  });

  it('mailchimp returns ok=false on API failure (never throws)', async () => {
    process.env.MAILCHIMP_API_KEY = 'key-us21';
    process.env.MAILCHIMP_AUDIENCE_ID = 'abc123';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"title":"Invalid"}', { status: 401 })));
    const res = await getEmailProvider().sendWelcome({
      name: 'Jane Smith', email: 'jane@example.com',
      code: 'WN-SMITH-AB2C', link: 'https://example.com',
    });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/providers.test.ts`
Expected: FAIL — cannot resolve `@/lib/providers/affiliates`.

- [ ] **Step 3: Write implementation**

`lib/providers/types.ts`:
```ts
export interface SyncResult {
  ok: boolean;
  detail: string;
}

export interface AffiliateProvider {
  name: string;
  createAffiliate(input: { code: string; name: string; email: string }): Promise<SyncResult>;
}

export interface EmailProvider {
  name: string;
  sendWelcome(input: {
    name: string;
    email: string;
    code: string;
    link: string;
  }): Promise<SyncResult>;
}
```

`lib/providers/affiliates.ts`:
```ts
import type { AffiliateProvider, SyncResult } from './types';

const mockAffiliate: AffiliateProvider = {
  name: 'mock',
  async createAffiliate({ code, name, email }): Promise<SyncResult> {
    console.log(`[mock affiliate] would create Shopify discount code ${code} for ${name} <${email}>`);
    return { ok: true, detail: `Mock mode: discount code ${code} recorded locally only.` };
  },
};

/**
 * Shopify Collabs has no write API, so we create a plain Shopify discount code
 * via the Admin GraphQL API; the /discount/{code} referral link applies it and
 * UTM params make attribution reportable.
 */
const shopifyAffiliate: AffiliateProvider = {
  name: 'shopify',
  async createAffiliate({ code, name }): Promise<SyncResult> {
    const domain = process.env.SHOPIFY_STORE_DOMAIN!;
    const token = process.env.SHOPIFY_ADMIN_TOKEN!;
    const percent = Number(process.env.AFFILIATE_DISCOUNT_PERCENT || '10');
    const mutation = `
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode { id }
          userErrors { field message }
        }
      }`;
    const variables = {
      basicCodeDiscount: {
        title: `Practitioner referral — ${name} (${code})`,
        code,
        startsAt: new Date().toISOString(),
        customerSelection: { all: true },
        customerGets: {
          value: { percentage: percent / 100 },
          items: { all: true },
        },
      },
    };
    try {
      const res = await fetch(`https://${domain}/admin/api/2024-07/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ query: mutation, variables }),
        signal: AbortSignal.timeout(10000),
      });
      const body = await res.json();
      const errors = body?.data?.discountCodeBasicCreate?.userErrors ?? [];
      if (!res.ok || body.errors || errors.length > 0) {
        return {
          ok: false,
          detail: `Shopify discount creation failed: ${JSON.stringify(body.errors ?? errors)}`,
        };
      }
      return { ok: true, detail: `Shopify discount code ${code} created (${percent}% off).` };
    } catch (err) {
      return { ok: false, detail: `Shopify request error: ${(err as Error).message}` };
    }
  },
};

export function getAffiliateProvider(): AffiliateProvider {
  if (process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_TOKEN) {
    return shopifyAffiliate;
  }
  return mockAffiliate;
}
```

`lib/providers/email.ts`:
```ts
import { createHash } from 'crypto';
import type { EmailProvider, SyncResult } from './types';

const mockEmail: EmailProvider = {
  name: 'mock',
  async sendWelcome({ name, email, code, link }): Promise<SyncResult> {
    console.log(`[mock email] would enrol ${email} in welcome sequence with code ${code} / ${link}`);
    return { ok: true, detail: `Mock mode: welcome email for ${email} logged only (${name}, ${code}).` };
  },
};

/**
 * Upserts the practitioner into the Mailchimp audience with merge fields
 * AFFCODE/AFFLINK and tags them "practitioner" — a Mailchimp Customer Journey
 * triggered on that tag sends the welcome sequence.
 */
const mailchimpEmail: EmailProvider = {
  name: 'mailchimp',
  async sendWelcome({ name, email, code, link }): Promise<SyncResult> {
    const apiKey = process.env.MAILCHIMP_API_KEY!;
    const audienceId = process.env.MAILCHIMP_AUDIENCE_ID!;
    const dc = apiKey.split('-').pop();
    const memberHash = createHash('md5').update(email.toLowerCase()).digest('hex');
    const base = `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${memberHash}`;
    const auth = 'Basic ' + Buffer.from(`anystring:${apiKey}`).toString('base64');
    const [firstName, ...rest] = name.trim().split(/\s+/);
    try {
      const upsert = await fetch(base, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({
          email_address: email,
          status_if_new: 'subscribed',
          merge_fields: {
            FNAME: firstName,
            LNAME: rest.join(' '),
            AFFCODE: code,
            AFFLINK: link,
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!upsert.ok) {
        return { ok: false, detail: `Mailchimp upsert failed (${upsert.status}): ${await upsert.text()}` };
      }
      const tag = await fetch(`${base}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ tags: [{ name: 'practitioner', status: 'active' }] }),
        signal: AbortSignal.timeout(10000),
      });
      if (!tag.ok) {
        return { ok: false, detail: `Mailchimp tagging failed (${tag.status}): ${await tag.text()}` };
      }
      return { ok: true, detail: `Mailchimp: ${email} enrolled with code ${code}, tagged "practitioner".` };
    } catch (err) {
      return { ok: false, detail: `Mailchimp request error: ${(err as Error).message}` };
    }
  },
};

export function getEmailProvider(): EmailProvider {
  if (process.env.MAILCHIMP_API_KEY && process.env.MAILCHIMP_AUDIENCE_ID) {
    return mailchimpEmail;
  }
  return mockEmail;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/providers.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/providers tests/providers.test.ts && git commit -m "feat: affiliate and email providers with env-gated mock fallback"
```

---

### Task 7: Pipeline orchestration

**Files:**
- Create: `lib/pipeline.ts`
- Test: `tests/pipeline.test.ts`

**Interfaces:**
- Consumes: `insertApplication/findByEmail/hasDuplicateRegistration/flagPractitioner/markApproved/markRejected/getPractitioner/isCodeTaken/addEvent/setPendingSync` (Task 3), `decide` (Task 4), `getRegister` (Task 5), `getAffiliateProvider/getEmailProvider` (Task 6), `generateCode/referralLink` (Task 2).
- Produces:
```ts
class DuplicateEmailError extends Error {}
interface ApplicationInput {
  name: string; email: string; registerBody: string;
  registerNumber: string; qualificationStatus: 'qualified' | 'student';
}
processApplication(input: ApplicationInput): Promise<Practitioner>  // throws DuplicateEmailError
approvePractitioner(id: number, decidedBy: string): Promise<Practitioner>  // idempotent
rejectPractitioner(id: number, decidedBy: string): Practitioner
retrySync(id: number): Promise<Practitioner>
```

- [ ] **Step 1: Write the failing test**

`tests/pipeline.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-pipe-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  delete process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_ADMIN_TOKEN;
  delete process.env.MAILCHIMP_API_KEY;
  delete process.env.MAILCHIMP_AUDIENCE_ID;
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

const app = {
  name: 'Jane Smith',
  email: 'jane@example.com',
  registerBody: 'BANT',
  registerNumber: '12345',
  qualificationStatus: 'qualified' as const,
};

function stubDirectory(html: string, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status })));
}

describe('processApplication', () => {
  it('auto-approves a qualified high-confidence match with code, link and events', async () => {
    stubDirectory('<div>Jane Smith — Registered Nutritional Therapist</div>');
    const { processApplication } = await import('@/lib/pipeline');
    const p = await processApplication(app);
    expect(p.status).toBe('approved');
    expect(p.verification?.reasonCode).toBe('AUTO_MATCH');
    expect(p.affiliateCode).toMatch(/^WN-SMITH-/);
    expect(p.affiliateLink).toContain(p.affiliateCode!);
    expect(p.pendingSync).toBe(false);
    expect(p.decidedBy).toBe('system');
    const { listEvents } = await import('@/lib/db');
    expect(listEvents(p.id).length).toBeGreaterThanOrEqual(2);
  });

  it('flags a no-match with manual search url', async () => {
    stubDirectory('<div>No results found</div>');
    const { processApplication } = await import('@/lib/pipeline');
    const p = await processApplication(app);
    expect(p.status).toBe('flagged');
    expect(p.verification?.reasonCode).toBe('NO_MATCH');
    expect(p.verification?.manualSearchUrl).toMatch(/^https:\/\//);
    expect(p.affiliateCode).toBeNull();
  });

  it('flags students without touching the directory', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { processApplication } = await import('@/lib/pipeline');
    const p = await processApplication({ ...app, qualificationStatus: 'student' });
    expect(p.status).toBe('flagged');
    expect(p.verification?.reasonCode).toBe('STUDENT_MANUAL');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('flags directory outages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const { processApplication } = await import('@/lib/pipeline');
    const p = await processApplication(app);
    expect(p.status).toBe('flagged');
    expect(p.verification?.reasonCode).toBe('DIRECTORY_UNAVAILABLE');
  });

  it('rejects duplicate email with DuplicateEmailError', async () => {
    stubDirectory('<div>Jane Smith</div>');
    const { processApplication, DuplicateEmailError } = await import('@/lib/pipeline');
    await processApplication(app);
    await expect(processApplication({ ...app, registerNumber: '999' }))
      .rejects.toBeInstanceOf(DuplicateEmailError);
  });

  it('flags same register number under a different email as DUPLICATE', async () => {
    stubDirectory('<div>Jane Smith</div>');
    const { processApplication } = await import('@/lib/pipeline');
    await processApplication(app);
    stubDirectory('<div>John Smith</div>');
    const p2 = await processApplication({ ...app, name: 'John Smith', email: 'john@example.com' });
    expect(p2.status).toBe('flagged');
    expect(p2.verification?.reasonCode).toBe('DUPLICATE');
  });
});

describe('approvePractitioner', () => {
  it('approves a flagged record and is idempotent', async () => {
    stubDirectory('<div>nothing</div>');
    const { processApplication, approvePractitioner } = await import('@/lib/pipeline');
    const flagged = await processApplication(app);
    const approved = await approvePractitioner(flagged.id, 'admin');
    expect(approved.status).toBe('approved');
    expect(approved.decidedBy).toBe('admin');
    const again = await approvePractitioner(flagged.id, 'admin');
    expect(again.affiliateCode).toBe(approved.affiliateCode);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pipeline.test.ts`
Expected: FAIL — cannot resolve `@/lib/pipeline`.

- [ ] **Step 3: Write implementation**

`lib/pipeline.ts`:
```ts
import {
  addEvent,
  findByEmail,
  flagPractitioner,
  getPractitioner,
  hasDuplicateRegistration,
  insertApplication,
  isCodeTaken,
  markApproved,
  markRejected,
  setPendingSync,
  type Practitioner,
  type QualificationStatus,
  type Verification,
} from '@/lib/db';
import { decide, type Confidence } from '@/lib/decision';
import { getRegister } from '@/lib/registers';
import { getAffiliateProvider } from '@/lib/providers/affiliates';
import { getEmailProvider } from '@/lib/providers/email';
import { generateCode, referralLink } from '@/lib/codes';

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`An application already exists for ${email}`);
  }
}

export interface ApplicationInput {
  name: string;
  email: string;
  registerBody: string;
  registerNumber: string;
  qualificationStatus: QualificationStatus;
}

export async function processApplication(input: ApplicationInput): Promise<Practitioner> {
  if (findByEmail(input.email)) throw new DuplicateEmailError(input.email);

  const adapter = getRegister(input.registerBody);
  if (!adapter) throw new Error(`Unknown register body: ${input.registerBody}`);

  const record = insertApplication(input);
  addEvent(record.id, 'application', `Application received for ${adapter.id} #${input.registerNumber}`);

  const isDuplicate = hasDuplicateRegistration(input.registerBody, input.registerNumber, record.id);

  let confidence: Confidence | null = null;
  let lookupDetail = 'Lookup skipped.';
  const skipLookup = isDuplicate || input.qualificationStatus === 'student';
  if (!skipLookup) {
    const result = await adapter.lookup(input.name, input.registerNumber);
    confidence = result.confidence;
    lookupDetail = result.detail;
  } else if (input.qualificationStatus === 'student') {
    lookupDetail = 'Student application — no public register entry to verify.';
  } else {
    lookupDetail = `Register number ${input.registerNumber} already exists on another ${adapter.id} application.`;
  }

  const decision = decide({
    qualificationStatus: input.qualificationStatus,
    confidence,
    isDuplicate,
  });

  const verification: Verification = {
    reasonCode: decision.reasonCode,
    confidence,
    detail: lookupDetail,
    manualSearchUrl: adapter.manualSearchUrl(input.name),
  };

  if (decision.status === 'approved') {
    return finalizeApproval(record.id, verification, 'system');
  }
  const flagged = flagPractitioner(record.id, verification);
  addEvent(record.id, 'decision', `Flagged for review: ${decision.reasonCode} — ${lookupDetail}`);
  return flagged;
}

export async function approvePractitioner(id: number, decidedBy: string): Promise<Practitioner> {
  const existing = getPractitioner(id);
  if (!existing) throw new Error(`No practitioner with id ${id}`);
  if (existing.status === 'approved' && existing.affiliateCode) return existing; // idempotent
  return finalizeApproval(id, existing.verification, decidedBy);
}

export function rejectPractitioner(id: number, decidedBy: string): Practitioner {
  const rejected = markRejected(id, decidedBy);
  addEvent(id, 'decision', `Rejected by ${decidedBy}`);
  return rejected;
}

export async function retrySync(id: number): Promise<Practitioner> {
  const p = getPractitioner(id);
  if (!p || p.status !== 'approved' || !p.affiliateCode || !p.affiliateLink) {
    throw new Error(`Practitioner ${id} is not an approved record awaiting sync`);
  }
  const ok = await runExternalSync(p.id, p.name, p.email, p.affiliateCode, p.affiliateLink);
  setPendingSync(id, !ok);
  return getPractitioner(id)!;
}

async function finalizeApproval(
  id: number,
  verification: Verification | null,
  decidedBy: string
): Promise<Practitioner> {
  const record = getPractitioner(id)!;
  const code = generateCode(record.name, isCodeTaken);
  const link = referralLink(code);
  const synced = await runExternalSync(id, record.name, record.email, code, link);
  const approved = markApproved(id, {
    verification: verification ?? undefined,
    affiliateCode: code,
    affiliateLink: link,
    pendingSync: !synced,
    decidedBy,
  });
  addEvent(id, 'decision', `Approved by ${decidedBy} — code ${code}${synced ? '' : ' (external sync pending)'}`);
  return approved;
}

/** Runs both external calls; logs each outcome; returns true only if both succeeded. */
async function runExternalSync(
  id: number,
  name: string,
  email: string,
  code: string,
  link: string
): Promise<boolean> {
  const affiliate = await getAffiliateProvider().createAffiliate({ code, name, email });
  addEvent(id, 'affiliate', affiliate.detail);
  const welcome = await getEmailProvider().sendWelcome({ name, email, code, link });
  addEvent(id, 'email', welcome.detail);
  return affiliate.ok && welcome.ok;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pipeline.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all test files PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline.ts tests/pipeline.test.ts && git commit -m "feat: application pipeline orchestrating verify, decide, approve, sync"
```

---

### Task 8: Public API route + branded apply page

**Files:**
- Create: `app/api/apply/route.ts`, `app/apply/page.tsx`, `components/ApplyForm.tsx`
- Test: `tests/api-apply.test.ts`

**Interfaces:**
- Consumes: `processApplication`, `DuplicateEmailError` (Task 7); Tailwind tokens (Task 1); `registers` (Task 5) for the dropdown labels.
- Produces: `POST /api/apply` → 200 `{ status: 'approved', code, link }` | 200 `{ status: 'flagged' }` | 400 `{ error }` | 409 `{ error }`.

- [ ] **Step 1: Write the failing test**

`tests/api-apply.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-api-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

function post(body: unknown) {
  return new Request('http://localhost/api/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const valid = {
  name: 'Jane Smith',
  email: 'jane@example.com',
  registerBody: 'BANT',
  registerNumber: '12345',
  qualificationStatus: 'qualified',
};

describe('POST /api/apply', () => {
  it('returns approved with code and link on a clear match', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<div>Jane Smith</div>', { status: 200 })));
    const { POST } = await import('@/app/api/apply/route');
    const res = await POST(post(valid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('approved');
    expect(body.code).toMatch(/^WN-SMITH-/);
    expect(body.link).toContain(body.code);
  });

  it('returns flagged without exposing internal reasons', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<div>no match here</div>', { status: 200 })));
    const { POST } = await import('@/app/api/apply/route');
    const res = await POST(post(valid));
    const body = await res.json();
    expect(body.status).toBe('flagged');
    expect(body.reasonCode).toBeUndefined();
    expect(body.code).toBeUndefined();
  });

  it('400s on invalid payload with field errors', async () => {
    const { POST } = await import('@/app/api/apply/route');
    const res = await POST(post({ ...valid, email: 'not-an-email', registerBody: 'GMC' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('409s on duplicate email', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<div>Jane Smith</div>', { status: 200 })));
    const { POST } = await import('@/app/api/apply/route');
    await POST(post(valid));
    const res = await POST(post({ ...valid, registerNumber: '777' }));
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api-apply.test.ts`
Expected: FAIL — cannot resolve `@/app/api/apply/route`.

- [ ] **Step 3: Write the API route**

`app/api/apply/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DuplicateEmailError, processApplication } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

const applySchema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name').max(100),
  email: z.string().trim().email('Please enter a valid email address'),
  registerBody: z.enum(['BANT', 'CNHC', 'NNA', 'ANP']),
  registerNumber: z.string().trim().min(2, 'Please enter your membership number').max(30),
  qualificationStatus: z.enum(['qualified', 'student']),
});

export async function POST(req: Request): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = applySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join('. ') },
      { status: 400 }
    );
  }

  try {
    const practitioner = await processApplication(parsed.data);
    if (practitioner.status === 'approved') {
      return NextResponse.json({
        status: 'approved',
        code: practitioner.affiliateCode,
        link: practitioner.affiliateLink,
      });
    }
    // Flagged: never leak verification internals to the applicant.
    return NextResponse.json({ status: 'flagged' });
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      return NextResponse.json(
        { error: 'An application already exists for this email address. Contact care@wildnutrition.com if you need help.' },
        { status: 409 }
      );
    }
    console.error('apply pipeline error', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your application. Please try again.' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api-apply.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the apply page (brand-matched)**

`components/ApplyForm.tsx`:
```tsx
'use client';

import { useState } from 'react';

const REGISTERS = [
  { id: 'BANT', label: 'BANT — British Association for Nutrition and Lifestyle Medicine' },
  { id: 'CNHC', label: 'CNHC — Complementary & Natural Healthcare Council' },
  { id: 'NNA', label: 'NNA — Naturopathic Nutrition Association' },
  { id: 'ANP', label: 'ANP — Association of Naturopathic Practitioners' },
];

type Result =
  | { kind: 'approved'; code: string; link: string }
  | { kind: 'flagged' }
  | { kind: 'error'; message: string }
  | null;

const inputClass =
  'w-full border border-stone bg-white px-4 py-3 text-ink2 focus:border-terracotta focus:outline-none';
const labelClass = 'mb-1.5 block text-xs uppercase tracking-[0.15em] text-ink2';

export default function ApplyForm() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setResult({ kind: 'error', message: body.error ?? 'Something went wrong.' });
      } else if (body.status === 'approved') {
        setResult({ kind: 'approved', code: body.code, link: body.link });
      } else {
        setResult({ kind: 'flagged' });
      }
    } catch {
      setResult({ kind: 'error', message: 'Network error — please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.kind === 'approved') {
    return (
      <div className="border border-sage bg-white p-8">
        <h2 className="font-heading text-3xl text-ink">Welcome to the community</h2>
        <p className="mt-4">
          Your registration was verified and your practitioner account is approved. Your unique
          referral code and link are below — they are also on their way to your inbox with your
          portal login instructions.
        </p>
        <div className="mt-6 bg-cream p-5">
          <p className={labelClass}>Your referral code</p>
          <p className="font-heading text-2xl text-terracotta">{result.code}</p>
          <p className={`${labelClass} mt-4`}>Your referral link</p>
          <p className="break-all text-sm">{result.link}</p>
        </div>
      </div>
    );
  }

  if (result?.kind === 'flagged') {
    return (
      <div className="border border-sage bg-white p-8">
        <h2 className="font-heading text-3xl text-ink">Thank you — application received</h2>
        <p className="mt-4">
          Our practitioner team is verifying your details with your professional register. We
          aim to be in touch within two working days with your account confirmation and
          referral code.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="border border-stone bg-white p-8">
      {result?.kind === 'error' && (
        <p className="mb-6 border border-terracotta bg-cream px-4 py-3 text-sm text-terracotta">
          {result.message}
        </p>
      )}
      <div className="space-y-5">
        <div>
          <label htmlFor="name" className={labelClass}>Full name</label>
          <input id="name" name="name" required minLength={2} className={inputClass} placeholder="As it appears on your register" />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>Email address</label>
          <input id="email" name="email" type="email" required className={inputClass} placeholder="you@practice.com" />
        </div>
        <div>
          <label htmlFor="registerBody" className={labelClass}>Professional register</label>
          <select id="registerBody" name="registerBody" required className={inputClass} defaultValue="">
            <option value="" disabled>Select your register…</option>
            {REGISTERS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="registerNumber" className={labelClass}>Register / membership number</label>
          <input id="registerNumber" name="registerNumber" required minLength={2} className={inputClass} placeholder="e.g. 12345" />
        </div>
        <div>
          <span className={labelClass}>Qualification status</span>
          <div className="mt-2 flex gap-6">
            <label className="flex items-center gap-2">
              <input type="radio" name="qualificationStatus" value="qualified" required className="accent-terracotta" />
              <span>Qualified practitioner</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="qualificationStatus" value="student" className="accent-terracotta" />
              <span>Student</span>
            </label>
          </div>
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="mt-8 w-full bg-ink px-8 py-4 text-xs uppercase tracking-[0.2em] text-cream transition-colors hover:bg-terracotta disabled:opacity-50"
      >
        {submitting ? 'Verifying…' : 'Sign up now'}
      </button>
      <p className="mt-4 text-xs text-ink2/70">
        We verify every application against your professional register. Students are reviewed
        individually by our practitioner team.
      </p>
    </form>
  );
}
```

`app/apply/page.tsx`:
```tsx
import ApplyForm from '@/components/ApplyForm';

export default function ApplyPage() {
  return (
    <div>
      <section className="bg-sage/40">
        <div className="mx-auto max-w-5xl px-6 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-forest">For Practitioners</p>
          <h1 className="mx-auto mt-4 max-w-2xl font-heading text-4xl leading-tight text-ink md:text-5xl">
            Join our expert practitioner community
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-ink2/90">
            Connect with a like-minded network of nutritional therapists and functional medicine
            practitioners dedicated to advancing clinical knowledge.
          </p>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-10 px-6 py-14 md:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="font-heading text-3xl text-ink">Why join the community?</h2>
          <ul className="mt-6 space-y-4 text-ink2/90">
            <li><span className="font-heading text-lg text-terracotta">Technical support</span><br />Comprehensive guidance on our brand, product applications, and contraindications.</li>
            <li><span className="font-heading text-lg text-terracotta">Events &amp; education diary</span><br />The latest on upcoming industry events and webinars.</li>
            <li><span className="font-heading text-lg text-terracotta">Educational hub</span><br />Case studies, webinars, advanced scientific studies and technical sheets.</li>
            <li><span className="font-heading text-lg text-terracotta">Your referral code</span><br />A unique code and link to share with clients, generated on approval.</li>
          </ul>
        </div>
        <ApplyForm />
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Verify build and full suite**

Run: `npm test && npm run build`
Expected: all tests PASS; build compiles with routes `/`, `/apply`, `/api/apply`.

- [ ] **Step 7: Commit**

```bash
git add app/api/apply app/apply components tests/api-apply.test.ts && git commit -m "feat: public apply API and brand-matched application form"
```

---

### Task 9: Admin auth + admin API routes

**Files:**
- Create: `lib/adminAuth.ts`, `app/api/admin/login/route.ts`, `app/api/admin/practitioners/route.ts`, `app/api/admin/practitioners/[id]/route.ts`
- Test: `tests/api-admin.test.ts`

**Interfaces:**
- Consumes: `listPractitioners/getPractitioner/listEvents` (Task 3), `approvePractitioner/rejectPractitioner/retrySync` (Task 7).
- Produces:
  - `lib/adminAuth.ts`: `adminToken(): string` (sha256 of `ADMIN_PASSWORD`), `isAuthed(req: Request): boolean` (checks `wn_admin` cookie).
  - `POST /api/admin/login` `{ password }` → 204 + `Set-Cookie: wn_admin=<token>; HttpOnly; Path=/; SameSite=Lax` | 401.
  - `GET /api/admin/practitioners?status=flagged` → 200 `{ practitioners: [...] }` | 401.
  - `POST /api/admin/practitioners/:id` `{ action: 'approve' | 'reject' | 'retry-sync' }` → 200 `{ practitioner, events }` | 401 | 404.

- [ ] **Step 1: Write the failing test**

`tests/api-admin.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-admin-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'secret-pass';
});

afterEach(async () => {
  (await import('@/lib/db')).resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function authedHeaders(): Promise<Record<string, string>> {
  const { adminToken } = await import('@/lib/adminAuth');
  return { Cookie: `wn_admin=${adminToken()}` };
}

async function seedFlagged() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<p>no match</p>', { status: 200 })));
  const { processApplication } = await import('@/lib/pipeline');
  const p = await processApplication({
    name: 'Jane Smith', email: 'jane@example.com', registerBody: 'BANT',
    registerNumber: '12345', qualificationStatus: 'qualified',
  });
  vi.unstubAllGlobals();
  return p;
}

describe('admin auth', () => {
  it('login sets cookie for correct password, 401 otherwise', async () => {
    const { POST } = await import('@/app/api/admin/login/route');
    const bad = await POST(new Request('http://x/api/admin/login', {
      method: 'POST', body: JSON.stringify({ password: 'wrong' }),
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(bad.status).toBe(401);
    const good = await POST(new Request('http://x/api/admin/login', {
      method: 'POST', body: JSON.stringify({ password: 'secret-pass' }),
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(good.status).toBe(204);
    expect(good.headers.get('set-cookie')).toContain('wn_admin=');
  });

  it('list endpoint requires auth', async () => {
    const { GET } = await import('@/app/api/admin/practitioners/route');
    const res = await GET(new Request('http://x/api/admin/practitioners'));
    expect(res.status).toBe(401);
  });
});

describe('admin actions', () => {
  it('lists practitioners filtered by status', async () => {
    const p = await seedFlagged();
    const { GET } = await import('@/app/api/admin/practitioners/route');
    const res = await GET(new Request('http://x/api/admin/practitioners?status=flagged', {
      headers: await authedHeaders(),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.practitioners.map((x: any) => x.id)).toEqual([p.id]);
  });

  it('approves a flagged practitioner via action endpoint', async () => {
    const p = await seedFlagged();
    const { POST } = await import('@/app/api/admin/practitioners/[id]/route');
    const res = await POST(
      new Request(`http://x/api/admin/practitioners/${p.id}`, {
        method: 'POST',
        headers: { ...(await authedHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      }),
      { params: { id: String(p.id) } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.practitioner.status).toBe('approved');
    expect(body.practitioner.affiliateCode).toMatch(/^WN-/);
    expect(body.events.length).toBeGreaterThan(0);
  });

  it('404s on unknown id and 400s on unknown action', async () => {
    const { POST } = await import('@/app/api/admin/practitioners/[id]/route');
    const headers = { ...(await authedHeaders()), 'Content-Type': 'application/json' };
    const missing = await POST(
      new Request('http://x/api/admin/practitioners/999', {
        method: 'POST', headers, body: JSON.stringify({ action: 'approve' }),
      }),
      { params: { id: '999' } }
    );
    expect(missing.status).toBe(404);
    const p = await seedFlagged();
    const badAction = await POST(
      new Request(`http://x/api/admin/practitioners/${p.id}`, {
        method: 'POST', headers, body: JSON.stringify({ action: 'explode' }),
      }),
      { params: { id: String(p.id) } }
    );
    expect(badAction.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api-admin.test.ts`
Expected: FAIL — cannot resolve `@/lib/adminAuth`.

- [ ] **Step 3: Write implementation**

`lib/adminAuth.ts`:
```ts
import { createHash, timingSafeEqual } from 'crypto';

export function adminToken(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('ADMIN_PASSWORD is not set');
  return createHash('sha256').update(password).digest('hex');
}

export function isAuthed(req: Request): boolean {
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)wn_admin=([a-f0-9]{64})/);
  if (!match) return false;
  try {
    const expected = Buffer.from(adminToken());
    const provided = Buffer.from(match[1]);
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}
```

`app/api/admin/login/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { adminToken } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  let password = '';
  try {
    password = (await req.json())?.password ?? '';
  } catch {
    /* fall through to 401 */
  }
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }
  const res = new NextResponse(null, { status: 204 });
  res.headers.set(
    'Set-Cookie',
    `wn_admin=${adminToken()}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`
  );
  return res;
}
```

`app/api/admin/practitioners/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { listPractitioners, type Status } from '@/lib/db';

export const dynamic = 'force-dynamic';

const STATUSES: Status[] = ['pending', 'approved', 'flagged', 'rejected'];

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const status = new URL(req.url).searchParams.get('status');
  const filter = STATUSES.includes(status as Status) ? (status as Status) : undefined;
  return NextResponse.json({ practitioners: listPractitioners(filter) });
}
```

`app/api/admin/practitioners/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { getPractitioner, listEvents } from '@/lib/db';
import { approvePractitioner, rejectPractitioner, retrySync } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  if (!getPractitioner(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  let action = '';
  try {
    action = (await req.json())?.action ?? '';
  } catch {
    /* handled below */
  }
  try {
    if (action === 'approve') await approvePractitioner(id, 'admin');
    else if (action === 'reject') rejectPractitioner(id, 'admin');
    else if (action === 'retry-sync') await retrySync(id);
    else return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    return NextResponse.json({ practitioner: getPractitioner(id), events: listEvents(id) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  const practitioner = getPractitioner(id);
  if (!practitioner) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ practitioner, events: listEvents(id) });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api-admin.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/adminAuth.ts app/api/admin tests/api-admin.test.ts && git commit -m "feat: admin auth and review action endpoints"
```

---

### Task 10: Admin dashboard UI

**Files:**
- Create: `app/admin/page.tsx`, `components/AdminDashboard.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/login`, `GET /api/admin/practitioners?status=`, `POST/GET /api/admin/practitioners/:id` (Task 9). `Practitioner` JSON shape from Task 3.
- Produces: `/admin` page — login gate, queue tabs (Flagged / Approved / Rejected / All), detail panel with verification evidence + manual-check link + Approve/Reject/Retry-sync buttons + audit trail.

- [ ] **Step 1: Write the components**

`app/admin/page.tsx`:
```tsx
import AdminDashboard from '@/components/AdminDashboard';

export const metadata = { title: 'Admin | WN Practitioner Community' };

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="font-heading text-3xl text-ink">Practitioner applications</h1>
      <AdminDashboard />
    </div>
  );
}
```

`components/AdminDashboard.tsx`:
```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

interface Verification {
  reasonCode: string;
  confidence: string | null;
  detail: string;
  manualSearchUrl: string;
}
interface Practitioner {
  id: number; name: string; email: string; registerBody: string;
  registerNumber: string; qualificationStatus: string; tier: string;
  status: string; verification: Verification | null;
  affiliateCode: string | null; affiliateLink: string | null;
  pendingSync: boolean; createdAt: string;
  decidedAt: string | null; decidedBy: string | null;
}
interface EventRow { id: number; type: string; detail: string; createdAt: string }

const TABS = [
  { id: 'flagged', label: 'Flagged' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: '', label: 'All' },
];

const REASON_LABELS: Record<string, string> = {
  AUTO_MATCH: 'Auto-approved — clear register match',
  PARTIAL_MATCH: 'Partial name match — check the register',
  NO_MATCH: 'No register match found',
  DIRECTORY_UNAVAILABLE: 'Register directory unreachable',
  STUDENT_MANUAL: 'Student — manual review required',
  DUPLICATE: 'Duplicate registration details',
};

export default function AdminDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [tab, setTab] = useState('flagged');
  const [rows, setRows] = useState<Practitioner[]>([]);
  const [selected, setSelected] = useState<Practitioner | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (currentTab: string) => {
    const res = await fetch(`/api/admin/practitioners${currentTab ? `?status=${currentTab}` : ''}`);
    if (res.status === 401) { setAuthed(false); return; }
    setAuthed(true);
    setRows((await res.json()).practitioners);
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) { setAuthed(true); load(tab); }
    else setLoginError('Incorrect password');
  }

  async function select(p: Practitioner) {
    setSelected(p);
    const res = await fetch(`/api/admin/practitioners/${p.id}`);
    if (res.ok) setEvents((await res.json()).events);
  }

  async function act(id: number, action: 'approve' | 'reject' | 'retry-sync') {
    setBusy(true);
    const res = await fetch(`/api/admin/practitioners/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      const body = await res.json();
      setSelected(body.practitioner);
      setEvents(body.events);
      load(tab);
    }
    setBusy(false);
  }

  if (authed === false) {
    return (
      <form onSubmit={login} className="mt-10 max-w-sm border border-stone bg-white p-8">
        <label className="mb-1.5 block text-xs uppercase tracking-[0.15em]">Admin password</label>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-stone px-4 py-3 focus:border-terracotta focus:outline-none"
        />
        {loginError && <p className="mt-2 text-sm text-terracotta">{loginError}</p>}
        <button className="mt-5 w-full bg-ink px-6 py-3 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta">
          Log in
        </button>
      </form>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex gap-2 border-b border-stone">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSelected(null); }}
            className={`px-4 py-2 text-xs uppercase tracking-[0.15em] ${
              tab === t.id ? 'border-b-2 border-terracotta text-terracotta' : 'text-ink2/70'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <table className="w-full border-collapse bg-white text-sm">
          <thead>
            <tr className="border-b border-stone text-left text-xs uppercase tracking-[0.1em] text-ink2/70">
              <th className="p-3">Name</th><th className="p-3">Register</th>
              <th className="p-3">Status</th><th className="p-3">Reason</th><th className="p-3">Applied</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                onClick={() => select(p)}
                className={`cursor-pointer border-b border-stone/60 hover:bg-cream ${
                  selected?.id === p.id ? 'bg-sage/30' : ''
                }`}
              >
                <td className="p-3">{p.name}<br /><span className="text-xs text-ink2/60">{p.email}</span></td>
                <td className="p-3">{p.registerBody} #{p.registerNumber}</td>
                <td className="p-3">
                  <span className={
                    p.status === 'approved' ? 'text-forest' :
                    p.status === 'flagged' ? 'text-terracotta' : 'text-ink2/70'
                  }>
                    {p.status}{p.pendingSync ? ' (sync pending)' : ''}
                  </span>
                </td>
                <td className="p-3 text-xs">{p.verification ? REASON_LABELS[p.verification.reasonCode] ?? p.verification.reasonCode : '—'}</td>
                <td className="p-3 text-xs">{p.createdAt}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-ink2/60">Nothing here.</td></tr>
            )}
          </tbody>
        </table>

        {selected && (
          <div className="h-fit border border-stone bg-white p-6">
            <h2 className="font-heading text-2xl text-ink">{selected.name}</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div><dt className="inline font-semibold">Email: </dt><dd className="inline">{selected.email}</dd></div>
              <div><dt className="inline font-semibold">Register: </dt><dd className="inline">{selected.registerBody} #{selected.registerNumber}</dd></div>
              <div><dt className="inline font-semibold">Status: </dt><dd className="inline">{selected.qualificationStatus} / {selected.status}</dd></div>
              {selected.affiliateCode && (
                <div><dt className="inline font-semibold">Code: </dt><dd className="inline">{selected.affiliateCode}</dd></div>
              )}
            </dl>
            {selected.verification && (
              <div className="mt-4 bg-cream p-4 text-sm">
                <p className="font-semibold">{REASON_LABELS[selected.verification.reasonCode] ?? selected.verification.reasonCode}</p>
                <p className="mt-1 text-ink2/80">{selected.verification.detail}</p>
                <a
                  href={selected.verification.manualSearchUrl}
                  target="_blank" rel="noreferrer"
                  className="mt-2 inline-block text-terracotta underline"
                >
                  Check the {selected.registerBody} register →
                </a>
              </div>
            )}
            <div className="mt-5 flex gap-3">
              {selected.status !== 'approved' && (
                <button disabled={busy} onClick={() => act(selected.id, 'approve')}
                  className="bg-forest px-5 py-2.5 text-xs uppercase tracking-[0.15em] text-cream disabled:opacity-50">
                  Approve
                </button>
              )}
              {selected.status !== 'rejected' && selected.status !== 'approved' && (
                <button disabled={busy} onClick={() => act(selected.id, 'reject')}
                  className="bg-terracotta px-5 py-2.5 text-xs uppercase tracking-[0.15em] text-cream disabled:opacity-50">
                  Reject
                </button>
              )}
              {selected.pendingSync && (
                <button disabled={busy} onClick={() => act(selected.id, 'retry-sync')}
                  className="border border-ink px-5 py-2.5 text-xs uppercase tracking-[0.15em] disabled:opacity-50">
                  Retry sync
                </button>
              )}
            </div>
            <h3 className="mt-6 text-xs uppercase tracking-[0.15em] text-ink2/70">Audit trail</h3>
            <ul className="mt-2 space-y-2 text-xs">
              {events.map((e) => (
                <li key={e.id} className="border-l-2 border-sage pl-3">
                  <span className="font-semibold">{e.type}</span> · {e.createdAt}<br />{e.detail}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build and full suite**

Run: `npm test && npm run build`
Expected: all tests PASS; build includes `/admin` route.

- [ ] **Step 3: Commit**

```bash
git add app/admin components/AdminDashboard.tsx && git commit -m "feat: admin review dashboard with queue, detail panel, and audit trail"
```

---

### Task 11: README + end-to-end smoke check

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

`README.md`:
```markdown
# Wild Nutrition — Practitioner Onboarding Portal

Automated practitioner application pipeline: branded apply form → register
verification → auto-approve or flag → affiliate code + referral link →
SQLite record → welcome email → admin review queue.

## Quick start

```bash
npm install
cp .env.example .env.local   # set ADMIN_PASSWORD at minimum
npm run dev                  # http://localhost:3100
```

- `/apply` — public application form (Wild Nutrition branded)
- `/admin` — review queue (password from `ADMIN_PASSWORD`)

## How verification works

1. Applicant submits name, email, register (BANT/CNHC/NNA/ANP), membership
   number, and qualification status.
2. The matching register adapter performs ONE polite, rate-limited, name-based
   lookup against the register's public directory (identified User-Agent, 8s
   timeout). No register exposes an API or number-based search, so results are
   confidence-scored: `high` / `partial` / `none` / `unavailable`.
3. Decision engine:
   - qualified + high → **auto-approved**
   - anything else (partial, none, outage, student, duplicate) → **flagged**
     with a reason code and a one-click manual register search link for the
     reviewer.
4. Approval (automatic or via admin) generates `WN-SURNAME-XXXX`, creates a
   Shopify discount code, builds the `/discount/CODE?utm_…` referral link, and
   enrols the practitioner in the Mailchimp welcome journey.
5. If Shopify/Mailchimp are unreachable, the record stays approved with
   "sync pending" and a **Retry sync** button in admin. Every step is written
   to the audit trail.

## Mock mode vs live mode

Without credentials the app runs fully — external calls are mocked and logged:

| Integration | Env vars to go live |
|---|---|
| Shopify discount codes | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN` (Admin API token with `write_discounts`), optional `AFFILIATE_DISCOUNT_PERCENT` (default 10) |
| Mailchimp welcome sequence | `MAILCHIMP_API_KEY`, `MAILCHIMP_AUDIENCE_ID` — create merge fields `AFFCODE`, `AFFLINK` on the audience and a Customer Journey triggered by the `practitioner` tag |

Shopify Collabs has no write API; discount code + UTM link is the supported
programmatic equivalent.

## Data

SQLite at `DB_PATH` (default `data/practitioners.db`). Tables: `practitioners`
(record, status, verification JSON, code/link, sync flag) and `events` (audit
log). WAL mode; safe for this single-writer workload.

## Tests

```bash
npm test
```

Covers the decision engine, code generation, data layer, register adapters
(fixture HTML), providers (mock + failure paths), pipeline, and API routes.

## Register terms of use

Lookups are deliberately minimal (one request per application, ≥1s apart,
identified UA). If a register objects or blocks, its adapter degrades to
`unavailable` and applications flag for manual review — the pipeline never
breaks. To disable automated lookup for a register entirely, make its
adapter's `lookup` return `unavailable` immediately.
```

- [ ] **Step 2: Full verification**

Run: `npm test && npm run build`
Expected: all suites PASS, production build succeeds.

Run smoke test with the dev server:
```bash
ADMIN_PASSWORD=test npm run dev &
sleep 5
curl -s -X POST http://localhost:3100/api/apply -H 'Content-Type: application/json' \
  -d '{"name":"Test Person","email":"smoke@example.com","registerBody":"BANT","registerNumber":"123","qualificationStatus":"student"}'
# expect {"status":"flagged"}
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add README.md && git commit -m "docs: README with setup, verification flow, and go-live env vars"
```

---

## Self-review notes

- Spec coverage: apply form (T8), verification adapters (T5), decision rules incl. students + duplicates (T4, T7), affiliate code/link via Shopify-or-mock (T2, T6), SQLite records + audit (T3), Mailchimp-or-mock welcome (T6), admin view with reasons/manual links/actions/retry (T9, T10), error-handling principles (politeFetch null-degrade, pending_sync, zod validation), branding tokens (T1, T8). Out-of-scope items from spec remain out.
- Type consistency: `Verification`, `Practitioner`, `Confidence`, `SyncResult`, provider/adapters signatures cross-checked between tasks.
- No placeholders: every step has full code and exact commands.
