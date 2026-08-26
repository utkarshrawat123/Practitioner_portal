import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { saveItem, unsaveItem, savedItemRefs, listSavedItems, type SavedItemType } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ALLOWED: SavedItemType[] = ['toolkit', 'media', 'lesson'];

/** Validates the body, so arbitrary strings can never reach the item_type column. */
async function parseBody(req: Request): Promise<{ itemType: SavedItemType; itemId: number } | null> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return null;
  }
  const { itemType, itemId } = (body ?? {}) as { itemType?: unknown; itemId?: unknown };
  if (typeof itemType !== 'string' || !ALLOWED.includes(itemType as SavedItemType)) return null;
  if (typeof itemId !== 'number' || !Number.isInteger(itemId) || itemId <= 0) return null;
  return { itemType: itemType as SavedItemType, itemId };
}

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const [refs, items] = await Promise.all([
    savedItemRefs(p.id),
    listSavedItems(p.id, p.qualificationStatus),
  ]);
  return NextResponse.json({ refs, items });
}

export async function POST(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const parsed = await parseBody(req);
  if (!parsed) return NextResponse.json({ error: 'Invalid itemType or itemId' }, { status: 400 });
  await saveItem(p.id, parsed.itemType, parsed.itemId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const parsed = await parseBody(req);
  if (!parsed) return NextResponse.json({ error: 'Invalid itemType or itemId' }, { status: 400 });
  await unsaveItem(p.id, parsed.itemType, parsed.itemId);
  return NextResponse.json({ ok: true });
}
