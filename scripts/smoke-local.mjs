/**
 * Full-app local smoke: signs in as a real practitioner via the magic-link flow,
 * signs in as admin, then walks every page and API the way a browser would.
 * Reports one line per surface. Exit code 1 if anything failed.
 */
import { createHash } from 'node:crypto';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const PRACTITIONER = 'sarah.whitfield@example.com';
const ADMIN_PASSWORD = 'preview-admin';

const results = [];
function record(area, name, ok, detail) {
  results.push({ area, name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  [${area}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function practitionerCookie() {
  const res = await fetch(`${BASE}/api/auth/request-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: PRACTITIONER }),
  });
  const body = await res.json();
  if (!body.devLink) throw new Error('no devLink returned — is the DB seeded?');
  const verify = await fetch(body.devLink, { redirect: 'manual' });
  const setCookie = verify.headers.getSetCookie?.() ?? [];
  const session = setCookie.map((c) => c.split(';')[0]).find((c) => c.startsWith('wn_session'));
  if (!session) throw new Error(`no session cookie in: ${JSON.stringify(setCookie)}`);
  return session;
}

function adminCookie() {
  return `wn_admin=${createHash('sha256').update(ADMIN_PASSWORD).digest('hex')}`;
}

async function checkPage(area, path, cookie, expectations = []) {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
    const html = await res.text();
    const problems = [];
    if (res.status !== 200) problems.push(`status ${res.status}`);
    if (/Application error|Internal Server Error|__next_error__/i.test(html)) {
      problems.push('error boundary rendered');
    }
    for (const expect of expectations) {
      if (!html.includes(expect)) problems.push(`missing "${expect}"`);
    }
    record(area, path, problems.length === 0, problems.join('; '));
    return html;
  } catch (err) {
    record(area, path, false, err.message);
    return '';
  }
}

async function checkApi(area, path, cookie, expectStatus = 200) {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
    const ok = res.status === expectStatus;
    record(area, path, ok, ok ? `${res.status}` : `expected ${expectStatus}, got ${res.status}`);
  } catch (err) {
    record(area, path, false, err.message);
  }
}

const PRACTITIONER_PAGES = [
  '/dashboard', '/learning', '/library', '/cpd',
  '/toolkit', '/resources', '/assistant',
  '/community', '/events',
  '/carts', '/referrals', '/leaderboard',
];

const PRACTITIONER_APIS = [
  '/api/me', '/api/me/stats', '/api/me/pathways', '/api/me/cpd', '/api/me/toolkit',
  '/api/resources', '/api/library', '/api/me/community', '/api/me/events',
  '/api/me/carts', '/api/me/referrals', '/api/me/leaderboard', '/api/me/widgets',
  '/api/me/pearls', '/api/me/catalog',
];

const NAV_SECTIONS = ['Learn', 'My Clinic', 'Connect', 'Practice Growth'];

console.log(`\n=== Signed-out surfaces ===`);
await checkPage('public', '/', null);
await checkPage('public', '/apply', null, ['Apply']);
await checkPage('public', '/dashboard', null);

console.log(`\n=== Practitioner sign-in ===`);
let session = null;
try {
  session = await practitionerCookie();
  record('auth', 'magic-link sign-in', true, 'session cookie issued');
} catch (err) {
  record('auth', 'magic-link sign-in', false, err.message);
}

if (session) {
  console.log(`\n=== Practitioner pages (signed in) ===`);
  const dash = await checkPage('practitioner', '/dashboard', session);

  // The shell is a client component, so the nav arrives as RSC flight payload rather
  // than server-rendered <a> tags. Match how the page actually serialises — and match
  // the quoted form, so "Learn" cannot pass by matching inside "Learning".
  const linked = (path) => dash.includes(`href="${path}"`) || dash.includes(`\\"href\\":\\"${path}\\"`);
  const titled = (title) => dash.includes(`>${title}<`) || dash.includes(`\\"title\\":\\"${title}\\"`);

  const missingSections = NAV_SECTIONS.filter((s) => !titled(s));
  record('nav', 'sidebar section headers', missingSections.length === 0,
    missingSections.length ? `missing: ${missingSections.join(', ')}` : NAV_SECTIONS.join(' / '));

  const missingLinks = PRACTITIONER_PAGES.filter((p) => !linked(p));
  record('nav', 'every route linked from the sidebar', missingLinks.length === 0,
    missingLinks.length ? `not linked: ${missingLinks.join(', ')}` : `all ${PRACTITIONER_PAGES.length} routes`);

  record('contact', 'support address rendered', dash.includes('utkarshrawatofficial@gmail.com'),
    dash.includes('utkarshrawatofficial@gmail.com') ? 'mailto present in sidebar' : 'NOT rendered');

  for (const path of PRACTITIONER_PAGES.filter((p) => p !== '/dashboard')) {
    await checkPage('practitioner', path, session);
  }

  console.log(`\n=== Practitioner APIs ===`);
  for (const path of PRACTITIONER_APIS) await checkApi('api', path, session);
}

console.log(`\n=== Admin console ===`);
const admin = adminCookie();
await checkPage('admin', '/admin', admin);
for (const path of [
  '/api/admin/practitioners', '/api/admin/lessons', '/api/admin/media', '/api/admin/toolkit',
  '/api/admin/pathways', '/api/admin/events', '/api/admin/community', '/api/admin/widgets',
  '/api/admin/pearls', '/api/admin/referrals', '/api/admin/reporting', '/api/admin/automation',
  '/api/admin/chat', '/api/admin/presence', '/api/admin/ai-queries', '/api/admin/readiness',
]) {
  await checkApi('admin-api', path, admin);
}

console.log(`\n=== Admin auth is enforced ===`);
await checkApi('security', '/api/admin/practitioners', null, 401);
await checkApi('security', '/api/admin/readiness', null, 401);
await checkApi('security', '/api/me/stats', null, 401);

const failed = results.filter((r) => !r.ok);
console.log(`\n${'='.repeat(60)}`);
console.log(`TOTAL ${results.length} checks — ${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) {
  console.log('\nFailures:');
  for (const f of failed) console.log(`  [${f.area}] ${f.name} — ${f.detail}`);
}
process.exit(failed.length ? 1 : 0);
