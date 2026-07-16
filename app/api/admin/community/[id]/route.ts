import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { getCommunityPost, setPostHidden, setPostPinned, deleteCommunityPost } from '@/lib/db';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({ hidden: z.boolean().optional(), pinned: z.boolean().optional() });

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  const post = await getCommunityPost(id);
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  if (parsed.data.hidden !== undefined) await setPostHidden(id, parsed.data.hidden);
  if (parsed.data.pinned !== undefined) await setPostPinned(id, parsed.data.pinned);
  return NextResponse.json({ post: await getCommunityPost(id) });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const post = await getCommunityPost(Number(params.id));
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await deleteCommunityPost(post.id);
  return NextResponse.json({ ok: true });
}
