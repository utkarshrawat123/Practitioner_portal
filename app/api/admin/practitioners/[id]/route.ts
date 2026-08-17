import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { getPractitioner, listEvents } from '@/lib/db';
import { approvePractitioner, rejectPractitioner, retrySync } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  if (!(await getPractitioner(id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  let action = '';
  try {
    action = (await req.json())?.action ?? '';
  } catch {
    /* handled below */
  }
  try {
    if (action === 'approve') await approvePractitioner(id, 'admin');
    else if (action === 'reject') await rejectPractitioner(id, 'admin');
    else if (action === 'retry-sync') await retrySync(id);
    else return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    return NextResponse.json({ practitioner: await getPractitioner(id), events: await listEvents(id) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  const practitioner = await getPractitioner(id);
  if (!practitioner) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ practitioner, events: await listEvents(id) });
}
