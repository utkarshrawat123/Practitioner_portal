import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { listNotifications, unreadNotificationCount } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const [items, unread] = await Promise.all([
    listNotifications(p.id),
    unreadNotificationCount(p.id),
  ]);
  return NextResponse.json({ items, unread });
}
