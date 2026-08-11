import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { createToolkitResource, listToolkitResources } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(['handout', 'protocol', 'decision_tree', 'recipe', 'faq', 'email_template']),
  description: z.string().trim().max(2000).optional().nullable(),
  audience: z.enum(['all', 'qualified', 'student']).optional(),
  contentKind: z.enum(['file', 'link', 'text']),
  url: z.string().url().optional().nullable(),
  body: z.string().max(20000).optional().nullable(),
  pathname: z.string().optional().nullable(),
  thumbnailUrl: z.string().url().optional().nullable(),
  published: z.boolean().optional(),
}).refine((d) => (d.contentKind === 'text' ? !!d.body : !!d.url), {
  message: 'Provide a URL for file/link resources, or body text for a text resource.',
});

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  return NextResponse.json({ resources: await listToolkitResources() });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  }
  const resource = await createToolkitResource(parsed.data);
  return NextResponse.json({ resource }, { status: 201 });
}
