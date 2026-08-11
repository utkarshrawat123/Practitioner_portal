import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import {
  addChatMessage,
  getOpenConversationForPractitioner,
  getOrCreateOpenConversation,
  listChatMessages,
  markConversationReadByPractitioner,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({ body: z.string().trim().min(1, 'Message cannot be empty').max(2000) });

/**
 * The practitioner's own live-chat thread. `?since=<id>` returns only newer
 * messages (the widget polls with this). Viewing marks admin replies as read.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const convo = await getOpenConversationForPractitioner(p.id);
  if (!convo) return NextResponse.json({ conversationId: null, messages: [] });
  const since = Number(new URL(req.url).searchParams.get('since') ?? 0) || 0;
  const messages = await listChatMessages(convo.id, since);
  await markConversationReadByPractitioner(convo.id);
  return NextResponse.json({ conversationId: convo.id, status: convo.status, messages });
}

export async function POST(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  }
  const convo = await getOrCreateOpenConversation(p.id, parsed.data.body.slice(0, 120));
  const message = await addChatMessage({ conversationId: convo.id, sender: 'practitioner', body: parsed.data.body });
  return NextResponse.json({ conversationId: convo.id, message }, { status: 201 });
}
