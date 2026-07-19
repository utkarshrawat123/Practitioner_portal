'use client';

import { usePathname } from 'next/navigation';

/**
 * Hides the global (practitioner-context) site chrome on routes that must not
 * show the practitioner nav:
 *  - `/onboarding/*` — the full-takeover Welcome experience.
 *  - `/admin` — the admin console, which renders its own header. Without this,
 *    an admin who also holds a practitioner session would see the practitioner
 *    nav (Home → /dashboard, Log out) on top of the admin page.
 * SiteHeader stays a server component — it's passed in as children and this
 * client wrapper only decides whether to show it, based on the current path.
 */
export default function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/onboarding') || pathname?.startsWith('/admin')) return null;
  return <>{children}</>;
}
