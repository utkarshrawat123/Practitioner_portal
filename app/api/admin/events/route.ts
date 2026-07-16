import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { createHubEvent, listHubEvents } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  startsAt: z.string().min(1),
  endsAt: z.string().optional().nullable(),
  location: z.string().trim().max(500).optional().nullable(),
  eventType: z.enum(['online', 'in_person']).optional(),
  capacity: z.number().int().positive().optional().nullable(),
  audience: z.enum(['all', 'qualified', 'student']).optional(),
  recordingUrl: z.string().url().optional().nullable(),
  published: z.boolean().optional(),
});

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  return NextResponse.json({ events: await listHubEvents() });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  const event = await createHubEvent(parsed.data);
  return NextResponse.json({ event }, { status: 201 });
}
