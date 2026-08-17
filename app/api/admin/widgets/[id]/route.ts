import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { deleteHomepageWidget, getHomepageWidget, updateHomepageWidget } from '@/lib/db';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().max(2000).optional().nullable(),
  linkUrl: z.string().url().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  audience: z.enum(['all', 'qualified', 'student']).optional(),
  position: z.number().int().optional(),
  published: z.boolean().optional(),
});

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  }
  const widget = await updateHomepageWidget(id, parsed.data);
  if (!widget) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ widget });
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const existing = await getHomepageWidget(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await deleteHomepageWidget(id);
  return NextResponse.json({ ok: true });
}
