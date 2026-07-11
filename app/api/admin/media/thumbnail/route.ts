import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { resolveLinkThumbnail } from '@/lib/media/thumbnail';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const url = new URL(req.url).searchParams.get('url');
  if (!url) return NextResponse.json({ thumbnailUrl: null });
  return NextResponse.json({ thumbnailUrl: await resolveLinkThumbnail(url) });
}
