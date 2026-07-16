import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { getHubEvent, updateHubEvent, deleteHubEvent } from '@/lib/db';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().optional().nullable(),
  location: z.string().trim().max(500).optional().nullable(),
  eventType: z.enum(['online', 'in_person']).optional(),
  capacity: z.number().int().positive().optional().nullable(),
  audience: z.enum(['all', 'qualified', 'student']).optional(),
  recordingUrl: z.string().url().optional().nullable(),
  published: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  const event = await updateHubEvent(Number(params.id), parsed.data);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ event });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const event = await getHubEvent(Number(params.id));
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await deleteHubEvent(event.id);
  return NextResponse.json({ ok: true });
}
