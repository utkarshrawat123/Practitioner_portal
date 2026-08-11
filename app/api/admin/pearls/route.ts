import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { createClinicalPearl, listClinicalPearls } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  body: z.string().trim().min(3).max(600),
  category: z.string().trim().max(80).optional().nullable(),
  audience: z.enum(['all', 'qualified', 'student']).optional(),
  status: z.enum(['draft', 'published']).optional(),
});

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const status = new URL(req.url).searchParams.get('status') ?? undefined;
  return NextResponse.json({ pearls: await listClinicalPearls(status) });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  }
  const pearl = await createClinicalPearl({ ...parsed.data, source: 'manual' });
  return NextResponse.json({ pearl }, { status: 201 });
}
