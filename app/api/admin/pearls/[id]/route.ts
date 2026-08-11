import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { deleteClinicalPearl, getClinicalPearl, updateClinicalPearl } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  body: z.string().trim().min(3).max(600).optional(),
  category: z.string().trim().max(80).optional().nullable(),
  audience: z.enum(['all', 'qualified', 'student']).optional(),
  status: z.enum(['draft', 'published']).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  if (!(await getClinicalPearl(Number(params.id)))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  }
  const pearl = await updateClinicalPearl(Number(params.id), parsed.data);
  return NextResponse.json({ pearl });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  await deleteClinicalPearl(Number(params.id));
  return NextResponse.json({ ok: true });
}
