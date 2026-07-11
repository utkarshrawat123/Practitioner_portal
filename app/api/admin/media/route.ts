import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { createMedia, getMedia, listMedia } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(['video', 'document', 'slides', 'image']),
  description: z.string().trim().max(2000).optional().nullable(),
  contentKind: z.enum(['file', 'link']),
  url: z.string().url(),
  pathname: z.string().optional().nullable(),
  thumbnailUrl: z.string().url().optional().nullable(),
  thumbnailPathname: z.string().optional().nullable(),
  size: z.number().int().nonnegative().optional().nullable(),
});

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  return NextResponse.json({ media: await listMedia() });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  }
  const d = parsed.data;
  const id = await createMedia({
    title: d.title,
    type: d.type,
    description: d.description ?? null,
    contentKind: d.contentKind,
    url: d.url,
    pathname: d.pathname ?? null,
    thumbnailUrl: d.thumbnailUrl ?? null,
    thumbnailPathname: d.thumbnailPathname ?? null,
    size: d.size ?? null,
  });
  return NextResponse.json({ media: await getMedia(id) }, { status: 201 });
}
