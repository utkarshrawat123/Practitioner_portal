import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { adminUnreadCount, getOrCreateOpenConversation, listConversationsForAdmin, type ChatStatus } from '@/lib/db';

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

const startSchema = z.object({ practitionerId: z.number().int().positive() });

/** Admin starts (or reuses) an open conversation with a practitioner — used by the "Online now" list. */
export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = startSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'practitionerId required' }, { status: 400 });
  const convo = await getOrCreateOpenConversation(parsed.data.practitionerId, 'Started by Wild Nutrition');
  return NextResponse.json({ conversationId: convo.id }, { status: 201 });
}
