import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { addPathwayModule, getPathway } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  contentKind: z.enum(['lesson', 'media']),
  contentId: z.number().int(),
  position: z.number().int().optional(),
  required: z.boolean().optional(),
});

export async function POST(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const pathway = await getPathway(Number(params.id));
  if (!pathway) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  const module = await addPathwayModule(pathway.id, parsed.data);
  return NextResponse.json({ module }, { status: 201 });
}
