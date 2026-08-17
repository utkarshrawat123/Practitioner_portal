import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { getHubEvent, registerForEvent, unregisterFromEvent, registeredEventIds, eventRegistrationCount } from '@/lib/db';
import { hasAccess } from '@/lib/access';
import { sendEventConfirmation } from '@/lib/events/notify';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const event = await getHubEvent(Number(params.id));
  if (!event || !event.published || !hasAccess(p, event)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const already = (await registeredEventIds(p.id)).includes(event.id);
  if (!already && event.capacity != null && (await eventRegistrationCount(event.id)) >= event.capacity) {
    return NextResponse.json({ error: 'This event is full.' }, { status: 409 });
  }
  await registerForEvent(p.id, event.id);
  const email = await sendEventConfirmation(p, event);
  return NextResponse.json({ ok: true, emailed: email.ok });
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  await unregisterFromEvent(p.id, Number(params.id));
  return NextResponse.json({ ok: true });
}
