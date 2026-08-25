import { hasAccess, type Audience } from '@/lib/access';
import type { QualificationStatus } from '@/lib/db';

export interface NavItem {
  label: string;
  href: string;
  audience?: Audience;
}

export interface NavSection {
  /** Null for the leading, untitled section (Dashboard). */
  title: string | null;
  items: NavItem[];
}

/**
 * The practitioner sidebar, grouped to the design deck's pillars.
 *
 * The deck's nav shows "Practice Growth" and "My Clinic" as containers; the build
 * has the underlying features under their own names. Decision (2026-08-25): these
 * are GROUPINGS ONLY — no route is renamed or moved. See
 * docs/DECK_GAP_ANALYSIS.md §7.
 */
export const PRACTITIONER_NAV: NavSection[] = [
  {
    title: null,
    items: [{ label: 'Dashboard', href: '/dashboard' }],
  },
  {
    title: 'Learn',
    items: [
      { label: 'Learning Pathways', href: '/learning' },
      { label: 'Lessons', href: '/library' },
      { label: 'My CPD', href: '/cpd' },
    ],
  },
  {
    title: 'My Clinic',
    items: [
      { label: 'Clinical Toolkit', href: '/toolkit' },
      { label: 'Resources', href: '/resources' },
      { label: 'Ask the Expert', href: '/assistant' },
    ],
  },
  {
    title: 'Connect',
    items: [
      { label: 'Community', href: '/community' },
      { label: 'Events', href: '/events' },
    ],
  },
  {
    title: 'Practice Growth',
    items: [
      { label: 'Patient Carts', href: '/carts' },
      { label: 'Refer & Earn', href: '/referrals' },
      { label: 'Leaderboard', href: '/leaderboard' },
    ],
  },
];

/**
 * Every practitioner-facing route that must be reachable from the sidebar.
 * A test asserts the nav covers all of these, so a new page cannot end up
 * reachable only from a dashboard tile.
 */
export const ALL_PRACTITIONER_ROUTES = [
  '/dashboard',
  '/learning',
  '/library',
  '/cpd',
  '/toolkit',
  '/resources',
  '/assistant',
  '/community',
  '/events',
  '/carts',
  '/referrals',
  '/leaderboard',
] as const;

/**
 * Filters the nav for one practitioner, dropping audience-gated items they cannot
 * see and any section left empty as a result. Returns [] when signed out.
 */
export function buildPractitionerNav(
  practitioner: { qualificationStatus: QualificationStatus } | null,
  sections: NavSection[] = PRACTITIONER_NAV
): NavSection[] {
  if (!practitioner) return [];
  return sections
    .map((section) => ({
      title: section.title,
      items: section.items.filter((item) => hasAccess(practitioner, item)),
    }))
    .filter((section) => section.items.length > 0);
}
