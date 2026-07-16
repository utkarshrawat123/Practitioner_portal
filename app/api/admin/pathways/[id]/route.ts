import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { getPathway, listPathwayModules, updatePathway, deletePathway } from '@/lib/db';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  category: z.string().trim().max(100).optional().nullable(),
  cpdHours: z.number().nonnegative().optional(),
  audience: z.enum(['all', 'qualified', 'student']).optional(),
  published: z.boolean().optional(),
});

export async function GET(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const pathway = await getPathway(Number(params.id));
  if (!pathway) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ pathway, modules: await listPathwayModules(pathway.id) });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  const pathway = await updatePathway(Number(params.id), parsed.data);
  if (!pathway) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ pathway });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const pathway = await getPathway(Number(params.id));
  if (!pathway) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await deletePathway(pathway.id);
  return NextResponse.json({ ok: true });
}
