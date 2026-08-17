import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { getCommunityPost, listCommunityReplies, upvotedPostIds } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const post = await getCommunityPost(Number(params.id));
  if (!post || post.hidden) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const replies = await listCommunityReplies(post.id);
  const upvoted = (await upvotedPostIds(p.id)).includes(post.id);
  return NextResponse.json({ post: { ...post, upvotedByMe: upvoted }, replies });
}
