import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { isAuthed } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

// Compensating cleanup for orphaned Blob objects. The browser uploads files to
// Vercel Blob first, then POSTs metadata to /api/admin/media. If that metadata
// POST fails, the just-uploaded blob(s) are never referenced by a media row and
// would leak. The client calls this to delete those now-unreferenced URLs.
export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let body: { urls?: unknown };
  try { body = (await req.json()) as { urls?: unknown }; } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const urls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === 'string' && u.length > 0) : [];
  if (!urls.length) return NextResponse.json({ error: 'urls must be a non-empty array' }, { status: 400 });
  // Best-effort: mirror the DELETE route's swallow-and-log pattern.
  try { await del(urls); } catch (err) { console.error('media blob cleanup failed', err); }
  return NextResponse.json({ ok: true });
}
