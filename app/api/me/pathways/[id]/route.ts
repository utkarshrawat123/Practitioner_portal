import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { getPathway, listPathwayModules, pathwayProgress, getLesson, getMedia, getCertificate } from '@/lib/db';
import { hasAccess } from '@/lib/access';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  const pathway = await getPathway(id);
  if (!pathway || !pathway.published || !hasAccess(p, pathway)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const modules = await listPathwayModules(id);
  const resolved = await Promise.all(
    modules.map(async (m) => {
      let contentTitle = m.title;
      if (m.contentKind === 'lesson') contentTitle = (await getLesson(m.contentId))?.title ?? m.title;
      else contentTitle = (await getMedia(m.contentId))?.title ?? m.title;
      return { ...m, contentTitle };
    })
  );
  const progress = await pathwayProgress(p.id, id);
  const certificate = await getCertificate(p.id, id);
  return NextResponse.json({ pathway, modules: resolved, progress, certificate });
}
