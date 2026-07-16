import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { getCommunityPost, toggleUpvote } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const post = await getCommunityPost(Number(params.id));
  if (!post || post.hidden) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const upvoted = await toggleUpvote(p.id, post.id);
  return NextResponse.json({ upvoted });
}
