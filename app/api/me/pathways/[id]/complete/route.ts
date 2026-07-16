import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { getPathway, getPathwayModule, markModuleComplete, pathwayProgress } from '@/lib/db';
import { hasAccess } from '@/lib/access';
import { maybeIssueCertificate } from '@/lib/certificates';

export const dynamic = 'force-dynamic';

const schema = z.object({ moduleId: z.number().int() });

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  const pathway = await getPathway(id);
  if (!pathway || !pathway.published || !hasAccess(p, pathway)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const mod = await getPathwayModule(parsed.data.moduleId);
  if (!mod || mod.pathwayId !== id) return NextResponse.json({ error: 'Invalid module' }, { status: 400 });

  await markModuleComplete(p.id, mod.id);
  const certificate = await maybeIssueCertificate(p.id, p.name, pathway);
  const progress = await pathwayProgress(p.id, id);
  return NextResponse.json({ progress, certificate });
}
