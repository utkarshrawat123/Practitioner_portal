import { NextResponse } from 'next/server';
import { deleteObjects } from '@/lib/storage';
import { isAuthed } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

// Compensating cleanup for orphaned uploads. The browser uploads a file (stored
// in R2/local), then POSTs metadata to /api/admin/media. If that metadata POST
// fails, the just-uploaded object is never referenced by a media row and would
// leak. The client calls this to delete those now-unreferenced objects by key.
export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let body: { keys?: unknown };
  try {
    body = (await req.json()) as { keys?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const keys = Array.isArray(body.keys)
    ? body.keys.filter((k): k is string => typeof k === 'string' && k.length > 0)
    : [];
  if (!keys.length) return NextResponse.json({ error: 'keys must be a non-empty array' }, { status: 400 });
  // Best-effort: mirror the DELETE route's swallow-and-log pattern.
  try { await deleteObjects(keys); } catch (err) { console.error('media storage cleanup failed', err); }
  return NextResponse.json({ ok: true });
}
