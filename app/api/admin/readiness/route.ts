import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { readinessReport } from '@/lib/readiness';

export const dynamic = 'force-dynamic';

/**
 * Go-live readiness. Set the company secrets, then hit this to confirm they
 * actually took effect in the Worker — it reports which integrations are live,
 * which are still mock, and what is missing, without ever returning a secret.
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  return NextResponse.json(readinessReport());
}
