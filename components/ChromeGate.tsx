'use client';

import { usePathname } from 'next/navigation';

/**
 * Hides the global site chrome (header/footer) on full-takeover routes like the
 * onboarding Welcome experience, which must render with no site nav visible.
 * SiteHeader stays a server component — it's passed in as children and this
 * client wrapper only decides whether to show it, based on the current path.
 */
export default function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/onboarding')) return null;
  return <>{children}</>;
}
