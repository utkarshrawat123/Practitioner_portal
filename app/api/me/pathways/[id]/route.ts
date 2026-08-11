import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { getPathway, listPathwayModules, pathwayProgress, getLesson, getMedia, getCertificate } from '@/lib/db';
import { maybeIssueCertificate } from '@/lib/certificates';
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
      if (m.contentKind === 'lesson') {
        const lesson = await getLesson(m.contentId);
        return {
          ...m,
          contentTitle: lesson?.title ?? m.title,
          mediaType: null as string | null,
          fileKind: null as 'file' | 'link' | null,
          url: null as string | null,
          description: lesson?.summary ?? null,
        };
      }
      const media = await getMedia(m.contentId);
      return {
        ...m,
        contentTitle: media?.title ?? m.title,
        mediaType: media?.type ?? null,
        fileKind: media?.contentKind ?? null,
        url: media?.url ?? null,
        description: media?.description ?? null,
      };
    })
  );
  const progress = await pathwayProgress(p.id, id);
  let certificate = await getCertificate(p.id, id);
  // Self-heal: if the pathway is complete but the certificate wasn't issued
  // (e.g. a Blob write failed during the completing request), retry now.
  if (progress.complete && !certificate?.pdfUrl) {
    try {
      certificate = (await maybeIssueCertificate(p.id, p.name, pathway)) ?? certificate;
    } catch (err) {
      console.error('deferred certificate issuance failed', err);
    }
  }
  return NextResponse.json({ pathway, modules: resolved, progress, certificate });
}
