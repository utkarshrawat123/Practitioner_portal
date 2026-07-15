import { cookies } from 'next/headers';
import { verifySessionValue } from '@/lib/practitionerAuth';
import { getPractitioner, type Practitioner } from '@/lib/db';

/**
 * Server-component/route counterpart to getSessionPractitioner(req): reads the
 * wn_session cookie via next/headers, verifies its HMAC, and resolves the row.
 * Used by the layout header and the dashboard/welcome page shells.
 */
export async function getServerSessionPractitioner(): Promise<Practitioner | null> {
  const value = cookies().get('wn_session')?.value;
  if (!value) return null;
  const id = verifySessionValue(value);
  return id ? getPractitioner(id) : null;
}
