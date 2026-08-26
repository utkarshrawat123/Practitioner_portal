/** Proves notification emission end to end against real workerd. */
import { createHash } from 'node:crypto';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const admin = `wn_admin=${createHash('sha256').update('preview-admin').digest('hex')}`;

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

// Sign in as a practitioner via the real magic-link flow.
const link = await (await fetch(`${BASE}/api/auth/request-link`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'sarah.whitfield@example.com' }),
})).json();
const verify = await fetch(link.devLink, { redirect: 'manual' });
const session = (verify.headers.getSetCookie() ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('wn_session'));
check('practitioner signed in', !!session);

const before = await (await fetch(`${BASE}/api/me/notifications`, { headers: { cookie: session } })).json();

// Admin creates an unpublished toolkit item…
const created = await (await fetch(`${BASE}/api/admin/toolkit`, {
  method: 'POST', headers: { cookie: admin, 'content-type': 'application/json' },
  body: JSON.stringify({
    title: `Notification probe ${Date.now()}`,
    type: 'protocol',
    description: 'Created by verify-notifications.mjs',
    audience: 'all',
    contentKind: 'link',
    url: 'https://example.org/probe',
    published: false,
  }),
})).json();
const id = created?.resource?.id;
check('admin created an unpublished toolkit item', !!id, `#${id}`);

const quiet = await (await fetch(`${BASE}/api/me/notifications`, { headers: { cookie: session } })).json();
check('creating it unpublished notifies nobody', quiet.unread === before.unread,
  `unread stayed ${quiet.unread}`);

// …then publishes it, which should notify.
await fetch(`${BASE}/api/admin/toolkit/${id}`, {
  method: 'PATCH', headers: { cookie: admin, 'content-type': 'application/json' },
  body: JSON.stringify({ published: true }),
});

const after = await (await fetch(`${BASE}/api/me/notifications`, { headers: { cookie: session } })).json();
check('publishing produced a notification', after.unread > before.unread,
  `unread ${before.unread} -> ${after.unread}`);
check('the notification names the item', !!after.items[0]?.title?.includes('Notification probe'),
  after.items[0]?.title);
check('it links to the toolkit', after.items[0]?.href === '/toolkit');

// Mark all read.
await fetch(`${BASE}/api/me/notifications/read`, { method: 'POST', headers: { cookie: session } });
const cleared = await (await fetch(`${BASE}/api/me/notifications`, { headers: { cookie: session } })).json();
check('mark all read clears the count', cleared.unread === 0, `unread ${cleared.unread}`);

// Tidy up the probe item so repeat runs stay clean.
await fetch(`${BASE}/api/admin/toolkit/${id}`, { method: 'DELETE', headers: { cookie: admin } });

console.log(`\n${failures === 0 ? 'ALL NOTIFICATION CHECKS PASSED' : failures + ' FAILED'}`);
process.exit(failures ? 1 : 0);
