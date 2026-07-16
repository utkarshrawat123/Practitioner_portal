import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { listPublishedEvents, registeredEventIds, eventRegistrationCount } from '@/lib/db';
import { hasAccess } from '@/lib/access';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const events = (await listPublishedEvents()).filter((e) => hasAccess(p, e));
  const registered = new Set(await registeredEventIds(p.id));
  const withMeta = await Promise.all(events.map(async (e) => {
    const count = await eventRegistrationCount(e.id);
    return {
      ...e,
      registered: registered.has(e.id),
      registrationCount: count,
      spotsLeft: e.capacity == null ? null : Math.max(0, e.capacity - count),
    };
  }));
  return NextResponse.json({ events: withMeta });
}
