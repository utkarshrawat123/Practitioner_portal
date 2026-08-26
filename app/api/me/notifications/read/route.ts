import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { markNotificationsRead } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  // The practitioner id always comes from the session, never the body, so one
  // practitioner can never clear another's notifications.
  let id: number | undefined;
  try {
    const body = (await req.json()) as { id?: unknown };
    if (typeof body?.id === 'number' && Number.isInteger(body.id)) id = body.id;
  } catch {
    /* no body — mark all read */
  }

  await markNotificationsRead(p.id, id);
  return NextResponse.json({ ok: true });
}
