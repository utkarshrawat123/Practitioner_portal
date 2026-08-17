import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { getConversation, setConversationStatus } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({ status: z.enum(['open', 'closed']) });

/** Close or reopen a conversation. */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  if (!(await getConversation(Number(params.id)))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  }
  const conversation = await setConversationStatus(Number(params.id), parsed.data.status);
  return NextResponse.json({ conversation });
}
