import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { createHomepageWidget, listHomepageWidgets } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(2000).optional().nullable(),
  linkUrl: z.string().url().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  audience: z.enum(['all', 'qualified', 'student']).optional(),
  position: z.number().int().optional(),
  published: z.boolean().optional(),
});

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  return NextResponse.json({ widgets: await listHomepageWidgets() });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  }
  const d = parsed.data;
  const widget = await createHomepageWidget({
    title: d.title,
    body: d.body ?? null,
    linkUrl: d.linkUrl ?? null,
    imageUrl: d.imageUrl ?? null,
    audience: d.audience,
    position: d.position,
    published: d.published,
  });
  return NextResponse.json({ widget }, { status: 201 });
}
