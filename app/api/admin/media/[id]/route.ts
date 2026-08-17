import { NextResponse } from 'next/server';
import { deleteObjects } from '@/lib/storage';
import { isAuthed } from '@/lib/adminAuth';
import { getMedia, setMediaPublished, deleteMedia } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await getMedia(id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { published?: boolean };
  if (typeof body.published !== 'boolean') return NextResponse.json({ error: 'published must be boolean' }, { status: 400 });
  return NextResponse.json({ media: await setMediaPublished(id, body.published) });
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const item = await getMedia(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Best-effort: remove any stored file + uploaded thumbnail by key (pathname).
  // Links have null pathnames and nothing to delete.
  const keys = [item.pathname, item.thumbnailPathname].filter(Boolean) as string[];
  if (keys.length) { try { await deleteObjects(keys); } catch (err) { console.error('media storage cleanup failed', err); } }
  await deleteMedia(id);
  return NextResponse.json({ ok: true });
}
