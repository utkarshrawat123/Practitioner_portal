import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import {
  addChatMessage,
  getConversation,
  listChatMessages,
  markConversationReadByAdmin,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({ body: z.string().trim().min(1, 'Message cannot be empty').max(2000) });

/** Full thread for one conversation; viewing marks practitioner messages read. */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const convo = await getConversation(Number(params.id));
  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const since = Number(new URL(req.url).searchParams.get('since') ?? 0) || 0;
  const messages = await listChatMessages(convo.id, since);
  await markConversationReadByAdmin(convo.id);
  return NextResponse.json({ conversation: convo, messages });
}

/** Admin reply. */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const convo = await getConversation(Number(params.id));
  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  }
  const message = await addChatMessage({ conversationId: convo.id, sender: 'admin', body: parsed.data.body });
  return NextResponse.json({ message }, { status: 201 });
}
