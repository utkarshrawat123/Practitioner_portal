import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { updatePathwayModule, deletePathwayModule, getPathwayModule } from '@/lib/db';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  contentKind: z.enum(['lesson', 'media']).optional(),
  contentId: z.number().int().optional(),
  position: z.number().int().optional(),
  required: z.boolean().optional(),
});

export async function PATCH(req: Request, props: { params: Promise<{ id: string; moduleId: string }> }): Promise<NextResponse> {
  const params = await props.params;
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  const module = await updatePathwayModule(Number(params.moduleId), parsed.data);
  if (!module) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ module });
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string; moduleId: string }> }): Promise<NextResponse> {
  const params = await props.params;
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const existing = await getPathwayModule(Number(params.moduleId));
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await deletePathwayModule(existing.id);
  return NextResponse.json({ ok: true });
}
