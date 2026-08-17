import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { getPathway, getPathwayModule, markModuleComplete, pathwayProgress } from '@/lib/db';
import { hasAccess } from '@/lib/access';
import { maybeIssueCertificate } from '@/lib/certificates';

export const dynamic = 'force-dynamic';

const schema = z.object({ moduleId: z.number().int() });

export async function POST(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
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
  // Completion is recorded above and must stick even if certificate generation
  // (a Vercel Blob write) hiccups — otherwise the practitioner's final click 500s
  // despite the pathway being complete. Issuance is idempotent and retried on GET.
  let certificate = null;
  try {
    certificate = await maybeIssueCertificate(p.id, p.name, pathway);
  } catch (err) {
    console.error('certificate issuance failed (completion still recorded)', err);
  }
  const progress = await pathwayProgress(p.id, id);
  return NextResponse.json({ progress, certificate });
}
