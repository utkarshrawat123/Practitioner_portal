import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { listPublishedPathways, pathwayProgress } from '@/lib/db';
import { hasAccess } from '@/lib/access';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const pathways = (await listPublishedPathways()).filter((pw) => hasAccess(p, pw));
  const withProgress = await Promise.all(
    pathways.map(async (pw) => ({ ...pw, progress: await pathwayProgress(p.id, pw.id) }))
  );
  return NextResponse.json({ pathways: withProgress });
}
