import Link from 'next/link';
import { getServerSessionPractitioner } from '@/lib/serverSession';
import { hasAccess, type Audience } from '@/lib/access';
import LogoutButton from '@/components/LogoutButton';

interface NavItem { label: string; href: string; audience?: Audience }

const PRACTITIONER_NAV: NavItem[] = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Learning', href: '/learning' },
  { label: 'Clinical Toolkit', href: '/toolkit' },
  { label: 'Community', href: '/community' },
  { label: 'Events', href: '/events' },
];

export default async function SiteHeader() {
  const practitioner = await getServerSessionPractitioner();
  const signedIn = !!practitioner && practitioner.status === 'approved';
  const navItems = signedIn
    ? PRACTITIONER_NAV.filter((i) =>
        hasAccess({ qualificationStatus: practitioner!.qualificationStatus }, i))
    : [];

  return (
    <header className="border-b border-stone bg-cream">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
        <Link href={signedIn ? '/dashboard' : '/apply'} className="shrink-0 font-heading text-2xl tracking-wide text-ink">
          Wild Nutrition<sup className="align-super text-xs">®</sup>
        </Link>
        {signedIn ? (
          <nav className="flex items-center gap-5 overflow-x-auto text-xs uppercase tracking-[0.2em]">
            {navItems.map((i) => (
              <Link key={i.href} href={i.href} className="whitespace-nowrap text-ink2 transition-colors hover:text-terracotta">
                {i.label}
              </Link>
            ))}
            <LogoutButton />
          </nav>
        ) : (
          <nav className="flex items-center gap-6 text-xs uppercase tracking-[0.2em]">
            <Link href="/apply" className="text-ink2 transition-colors hover:text-terracotta">Apply</Link>
            <Link href="/dashboard" className="text-ink2 transition-colors hover:text-terracotta">Sign in</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
