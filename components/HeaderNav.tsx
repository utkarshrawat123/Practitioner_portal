'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import LogoutButton from '@/components/LogoutButton';

interface NavItem { label: string; href: string }

/**
 * Signed-in practitioner navigation. Desktop keeps the existing inline row
 * (unchanged); on mobile it collapses into a hamburger drop-down. Nav items are
 * computed server-side (audience-filtered) and passed in as props, so this
 * client component holds only presentational open/close state — no auth logic.
 */
export default function HeaderNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drop-down whenever the route changes (a link was followed).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Desktop: unchanged inline nav */}
      <nav className="hidden items-center gap-5 text-xs uppercase tracking-[0.2em] md:flex">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="whitespace-nowrap text-ink2 transition-colors hover:text-terracotta">
            {i.label}
          </Link>
        ))}
        <LogoutButton />
      </nav>

      {/* Mobile: hamburger toggle */}
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-ink2 transition-colors hover:text-terracotta md:hidden"
      >
        {open ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Mobile: drop-down panel */}
      {open && (
        <div className="absolute inset-x-0 top-full z-40 border-b border-stone bg-cream md:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-3 text-xs uppercase tracking-[0.2em]">
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className="whitespace-nowrap py-2.5 text-ink2 transition-colors hover:text-terracotta"
              >
                {i.label}
              </Link>
            ))}
            <div className="mt-1 border-t border-stone pt-3">
              <LogoutButton />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
