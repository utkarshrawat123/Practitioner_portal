/** Proves the read-time gating end to end against real workerd. */
import { createHash } from 'node:crypto';

const BASE = 'http://localhost:8787';
const admin = `wn_admin=${createHash('sha256').update('preview-admin').digest('hex')}`;

const step = (n, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`);
let failures = 0;
const check = (n, ok, detail) => { if (!ok) failures++; step(n, ok, detail); };

// 1. sign in as a practitioner
const link = await (await fetch(`${BASE}/api/auth/request-link`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'sarah.whitfield@example.com' }),
})).json();
const verify = await fetch(link.devLink, { redirect: 'manual' });
const session = (verify.headers.getSetCookie() ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('wn_session'));
check('practitioner signed in', !!session);

const asMe = { cookie: session, 'content-type': 'application/json' };

// 2. pick a real toolkit item
const toolkit = await (await fetch(`${BASE}/api/me/toolkit`, { headers: { cookie: session } })).json();
const target = toolkit.resources[0];
check('found a toolkit item to save', !!target, target ? `#${target.id} "${target.title}"` : 'none');

// 3. save it
await fetch(`${BASE}/api/me/saved`, { method: 'POST', headers: asMe, body: JSON.stringify({ itemType: 'toolkit', itemId: target.id }) });
let saved = await (await fetch(`${BASE}/api/me/saved`, { headers: { cookie: session } })).json();
check('appears in My Clinic after saving', saved.items.some((i) => i.itemType === 'toolkit' && i.itemId === target.id));
check('hydrated with its real title', saved.items.find((i) => i.itemId === target.id)?.title === target.title);

// 4. saving twice stays one row
await fetch(`${BASE}/api/me/saved`, { method: 'POST', headers: asMe, body: JSON.stringify({ itemType: 'toolkit', itemId: target.id }) });
saved = await (await fetch(`${BASE}/api/me/saved`, { headers: { cookie: session } })).json();
check('saving twice does not duplicate', saved.items.filter((i) => i.itemId === target.id && i.itemType === 'toolkit').length === 1);

// 5. admin unpublishes it → it must disappear from My Clinic
const patch = await fetch(`${BASE}/api/admin/toolkit/${target.id}`, {
  method: 'PATCH', headers: { cookie: admin, 'content-type': 'application/json' },
  body: JSON.stringify({ published: false }),
});
check('admin unpublished the item', patch.ok, `status ${patch.status}`);

saved = await (await fetch(`${BASE}/api/me/saved`, { headers: { cookie: session } })).json();
check('UNPUBLISHED ITEM VANISHES from My Clinic', !saved.items.some((i) => i.itemType === 'toolkit' && i.itemId === target.id));
check('but the save row is still there (refs unchanged)', saved.refs.some((r) => r.itemType === 'toolkit' && r.itemId === target.id));

// 6. republish → it comes back, proving nothing was destroyed
await fetch(`${BASE}/api/admin/toolkit/${target.id}`, {
  method: 'PATCH', headers: { cookie: admin, 'content-type': 'application/json' },
  body: JSON.stringify({ published: true }),
});
saved = await (await fetch(`${BASE}/api/me/saved`, { headers: { cookie: session } })).json();
check('reappears after republishing', saved.items.some((i) => i.itemType === 'toolkit' && i.itemId === target.id));

// 7. unsave cleans up
await fetch(`${BASE}/api/me/saved`, { method: 'DELETE', headers: asMe, body: JSON.stringify({ itemType: 'toolkit', itemId: target.id }) });
saved = await (await fetch(`${BASE}/api/me/saved`, { headers: { cookie: session } })).json();
check('unsave removes it', !saved.refs.some((r) => r.itemType === 'toolkit' && r.itemId === target.id));

console.log(`\n${failures === 0 ? 'ALL ROUND-TRIP CHECKS PASSED' : failures + ' FAILED'}`);
process.exit(failures ? 1 : 0);
