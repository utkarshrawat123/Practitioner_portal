'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Home, GraduationCap, ClipboardCheck, Users, CalendarDays, ShoppingBag,
  Gift, BookOpen, Award, UserRound, LifeBuoy, Menu, X, Sparkles, Trophy, type LucideIcon,
} from 'lucide-react';

import type { NavSection } from '@/lib/nav';

export interface SideNavItem { label: string; href: string }

/** Icon per route, matching the deck's line-icon sidebar. */
const ICONS: Record<string, LucideIcon> = {
  '/dashboard': Home,
  '/learning': GraduationCap,
  '/toolkit': ClipboardCheck,
  '/community': Users,
  '/events': CalendarDays,
  '/carts': ShoppingBag,
  '/referrals': Gift,
  '/resources': BookOpen,
  '/library': BookOpen,
  '/cpd': Award,
  '/leaderboard': Trophy,
  '/assistant': Sparkles,
  '/my-clinic': BookOpen,
};

function Wordmark() {
  return (
    <Link href="/dashboard" className="block px-6 pb-6 pt-6">
      <span className="block font-body text-[15px] font-semibold uppercase tracking-[0.18em] text-white">
        Wild Nutrition<sup className="align-super text-[8px]">®</sup>
      </span>
      <span className="mt-1 block font-body text-[9px] uppercase tracking-[0.3em] text-white/45">
        In Practice
      </span>
    </Link>
  );
}

function NavLinks({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="no-scrollbar flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
      {sections.map((section, sectionIndex) => (
        <div key={section.title ?? `section-${sectionIndex}`} className={sectionIndex > 0 ? 'mt-4' : ''}>
          {section.title && (
            <p className="px-3 pb-1.5 text-[11px] uppercase tracking-label text-white/45">
              {section.title}
            </p>
          )}
          <SectionLinks items={section.items} pathname={pathname} onNavigate={onNavigate} />
        </div>
      ))}
    </nav>
  );
}

function SectionLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: SideNavItem[];
  pathname: string | null;
  onNavigate?: () => void;
}) {
  return (
    <>
      {items.map((item) => {
        const Icon = ICONS[item.href] ?? BookOpen;
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[16px] transition-colors ${
              active ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon
              className={`h-[19px] w-[19px] shrink-0 ${active ? 'text-terracotta-light' : 'text-terracotta-mid'}`}
              strokeWidth={1.6}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

/**
 * Renders nothing without a configured support address — a missing "contact us"
 * block is a visible gap; a wrong address quietly misroutes practitioners.
 */
function HelpBlock({ supportEmail }: { supportEmail: string | null }) {
  if (!supportEmail) return null;
  return (
    <div className="mt-auto px-3 pb-6 pt-6">
      <div className="mx-3 border-t border-white/12 pt-5">
        <p className="text-[13px] text-white/45">Need help?</p>
        <a
          href={`mailto:${supportEmail}`}
          className="mt-2 flex items-center gap-2.5 text-[15px] text-white/75 transition-colors hover:text-white"
        >
          <LifeBuoy className="h-[17px] w-[17px] text-terracotta-mid" strokeWidth={1.6} />
          Contact our team
        </a>
      </div>
    </div>
  );
}

/**
 * Persistent navy sidebar — the shell from the design deck. Fixed on desktop;
 * on mobile it collapses behind a top bar with a slide-in drawer.
 */
export default function SideNav({ sections, supportEmail }: { sections: NavSection[]; supportEmail: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col bg-navy lg:flex">
        <Wordmark />
        <NavLinks sections={sections} />
        <HelpBlock supportEmail={supportEmail} />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center gap-3 bg-navy px-4 py-3 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10"
        >
          <Menu className="h-5 w-5" strokeWidth={1.7} />
        </button>
        <span className="font-body text-[13px] font-semibold uppercase tracking-[0.16em] text-white">
          Wild Nutrition<sup className="align-super text-[7px]">®</sup>
        </span>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-navy/60 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 flex w-[268px] flex-col bg-navy shadow-lift">
            <div className="flex items-start justify-between">
              <Wordmark />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="mr-3 mt-6 grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10"
              >
                <X className="h-5 w-5" strokeWidth={1.7} />
              </button>
            </div>
            <NavLinks sections={sections} onNavigate={() => setOpen(false)} />
            <HelpBlock supportEmail={supportEmail} />
          </div>
        </div>
      )}
    </>
  );
}
