import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { deleteToolkitResource, getToolkitResource, updateToolkitResource } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  type: z.enum(['handout', 'protocol', 'decision_tree', 'recipe', 'faq', 'email_template']).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  audience: z.enum(['all', 'qualified', 'student']).optional(),
  contentKind: z.enum(['file', 'link', 'text']).optional(),
  url: z.string().url().optional().nullable(),
  body: z.string().max(20000).optional().nullable(),
  thumbnailUrl: z.string().url().optional().nullable(),
  published: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const existing = await getToolkitResource(Number(params.id));
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  }
  const resource = await updateToolkitResource(existing.id, parsed.data);
  return NextResponse.json({ resource });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  await deleteToolkitResource(Number(params.id));
  return NextResponse.json({ ok: true });
}
