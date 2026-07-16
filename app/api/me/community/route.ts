import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { listCommunityPosts, createCommunityPost, getCommunityPost, upvotedPostIds } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  postType: z.enum(['discussion', 'ask_expert', 'member_spotlight']),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
});

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const posts = await listCommunityPosts();
  const upvoted = new Set(await upvotedPostIds(p.id));
  return NextResponse.json({ posts: posts.map((x) => ({ ...x, upvotedByMe: upvoted.has(x.id) })) });
}

export async function POST(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  const id = await createCommunityPost({ practitionerId: p.id, authorName: p.name, ...parsed.data });
  return NextResponse.json({ post: await getCommunityPost(id) }, { status: 201 });
}
