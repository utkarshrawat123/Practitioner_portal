import type { QualificationStatus } from '@/lib/db';

/**
 * Audience gate for any content item (lessons, pathways, toolkit, events, widgets).
 * Every gated table carries an `audience` column:
 *   'all'       → everyone (default)
 *   'qualified' → qualified HCPs only
 *   'student'   → students only
 *
 * Semantics are exact-match (not a hierarchy): 'qualified' content is hidden from
 * students and 'student' content is hidden from qualified HCPs. This is the single
 * check every downstream feature (Parts 3, 4, 5) calls — do not reimplement it.
 */
export type Audience = 'all' | 'qualified' | 'student';

export function hasAccess(
  practitioner: { qualificationStatus: QualificationStatus } | null,
  resource: { audience?: string | null }
): boolean {
  const audience = (resource.audience ?? 'all') as Audience;
  if (audience === 'all') return true;
  if (!practitioner) return false;
  return practitioner.qualificationStatus === audience;
}
