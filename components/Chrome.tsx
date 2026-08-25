'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SideNav, { type SideNavItem } from '@/components/SideNav';

/**
 * The application frame. Decides which chrome a route gets, and reserves the
 * space the fixed sidebar occupies — both need the same path logic, so they live
 * together rather than in two components that could drift apart.
 *
 *  - /onboarding/*, /admin, /pay/*  → no chrome at all (full-takeover routes;
 *    admin renders its own header, and the pay page is shown to patients).
 *  - signed in                      → navy sidebar (design deck shell).
 *  - signed out                     → slim top bar with Apply / Sign in.
 */
export default function Chrome({
  signedIn,
  navItems,
  children,
}: {
  signedIn: boolean;
  navItems: SideNavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const bare =
    pathname?.startsWith('/onboarding') ||
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/pay');

  if (bare) return <>{children}</>;

  if (!signedIn) {
    return (
      <>
        <header className="border-b border-stone bg-cream">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
            <Link href="/apply" className="shrink-0">
              <span className="block font-body text-[15px] font-semibold uppercase tracking-[0.18em] text-ink">
                Wild Nutrition<sup className="align-super text-[8px]">®</sup>
              </span>
              <span className="mt-0.5 block font-body text-[9px] uppercase tracking-[0.3em] text-ink2/50">
                In Practice
              </span>
            </Link>
            <nav className="flex items-center gap-6 text-[11px] uppercase tracking-label">
              <Link href="/apply" className="text-ink2 transition-colors hover:text-terracotta">Apply</Link>
              <Link href="/dashboard" className="text-ink2 transition-colors hover:text-terracotta">Sign in</Link>
            </nav>
          </div>
        </header>
        {children}
      </>
    );
  }

  return (
    <>
      <SideNav items={navItems} />
      <div className="lg:pl-[248px]">{children}</div>
    </>
  );
}
