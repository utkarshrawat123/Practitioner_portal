import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { getCommunityPost, createCommunityReply } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({ body: z.string().trim().min(1).max(8000) });

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const post = await getCommunityPost(Number(params.id));
  if (!post || post.hidden) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const id = await createCommunityReply({ postId: post.id, practitionerId: p.id, authorName: p.name, body: parsed.data.body });
  return NextResponse.json({ ok: true, replyId: id }, { status: 201 });
}
