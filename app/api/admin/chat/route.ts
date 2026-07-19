import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { adminUnreadCount, listConversationsForAdmin, type ChatStatus } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Admin conversation list + global unread count. `?unread=1` returns only the
 * count (the shell popup poller uses this from any tab). `?status=open|closed`
 * filters the list.
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.get('unread') === '1') {
    return NextResponse.json({ unread: await adminUnreadCount() });
  }
  const statusParam = url.searchParams.get('status');
  const status = statusParam === 'open' || statusParam === 'closed' ? (statusParam as ChatStatus) : undefined;
  const conversations = await listConversationsForAdmin(status);
  return NextResponse.json({ conversations, unread: await adminUnreadCount() });
}
