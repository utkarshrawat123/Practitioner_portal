import { NextResponse } from 'next/server';
import { getObject } from '@/lib/storage';
import { isAuthed } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * Streams a stored object (R2 on Workers, local disk in dev).
 * Certificates (`certifications/*`) are sensitive → admin-only. Marketing media
 * keys stream freely (they are also served directly from the public R2 bucket in
 * production; this route is the local/dev + gated path).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> }
): Promise<Response> {
  const { key: parts } = await params;
  const key = parts.join('/');

  if (key.startsWith('certifications/') && !isAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const obj = await getObject(key);
  if (!obj) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return new Response(obj.body as BodyInit, {
    headers: { 'Content-Type': obj.contentType, 'Cache-Control': 'private, no-store' },
  });
}
