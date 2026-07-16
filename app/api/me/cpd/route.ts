import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { listCertificates, listPublishedPathways, pathwayProgress, getPathway } from '@/lib/db';
import { hasAccess } from '@/lib/access';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const certs = await listCertificates(p.id);
  const certificates = await Promise.all(
    certs.map(async (c) => {
      const pw = await getPathway(c.pathwayId);
      return { ...c, pathwayTitle: pw?.title ?? 'Pathway', cpdHours: pw?.cpdHours ?? 0 };
    })
  );

  const pathways = (await listPublishedPathways()).filter((pw) => hasAccess(p, pw));
  const progress = await Promise.all(
    pathways.map(async (pw) => ({
      pathwayId: pw.id, title: pw.title, category: pw.category, cpdHours: pw.cpdHours,
      ...(await pathwayProgress(p.id, pw.id)),
    }))
  );
  return NextResponse.json({ certificates, progress });
}
