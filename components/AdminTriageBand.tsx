'use client';

import type { LucideIcon } from 'lucide-react';
import { ClipboardList, MessageSquare, Gift, UserPlus } from 'lucide-react';

export interface TriageCounts {
  flaggedApplications: number;
  unreadChats: number;
  referralsAwaitingApproval: number;
  newPractitioners7d: number;
}

interface Tile {
  key: keyof TriageCounts;
  label: string;
  cta: string;
  section: string;
  /** The applications filter to select, where the target section has one. */
  tab?: string;
  Icon: LucideIcon;
}

const TILES: Tile[] = [
  { key: 'flaggedApplications', label: 'Awaiting review', cta: 'Open queue', section: 'applications', tab: 'flagged', Icon: ClipboardList },
  { key: 'unreadChats', label: 'Unread chats', cta: 'Open chat', section: 'chat', Icon: MessageSquare },
  { key: 'referralsAwaitingApproval', label: 'Referrals to approve', cta: 'Review', section: 'referrals', Icon: Gift },
  { key: 'newPractitioners7d', label: 'New this week', cta: 'See all', section: 'applications', tab: '', Icon: UserPlus },
];

/**
 * The admin landing's at-a-glance band — "does anything need me?" answered
 * without clicking into seventeen sections.
 *
 * Every figure here has a real queue behind it. Content sections (media,
 * pearls, calendar, factory) have no queue in the data model, so they are
 * absent rather than padded with a decorative zero.
 *
 * It does not collapse or hide when every count is zero: it is wayfinding as
 * much as alerting, and a band that vanishes when quiet teaches the admin to
 * distrust its absence.
 *
 * Navy because white-on-navy is 16.5:1 — the contrast is trivially safe — and
 * it echoes the practitioner sidebar, so admin reads as the same product seen
 * from the other side rather than a different tool.
 */
export default function AdminTriageBand({
  counts,
  onOpen,
}: {
  counts: TriageCounts;
  onOpen: (section: string, tab?: string) => void;
}) {
  return (
    <section aria-label="Needs attention">
      {/*
        `gap-px` over a light wrapper draws the hairlines, so they stay correct
        however the grid wraps. `divide-x` stranded a rule at each row break.
      */}
      <div className="grid gap-px overflow-hidden rounded-card bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map(({ key, label, cta, section, tab, Icon }) => {
          const value = counts[key];
          return (
            <button
              key={key}
              onClick={() => onOpen(section, tab)}
              className="group flex flex-col items-start bg-navy-soft p-5 text-left transition-colors hover:bg-navy-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-terracotta-light"
            >
              <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-label text-terracotta-light">
                <Icon size={13} strokeWidth={1.9} aria-hidden="true" />
                {label}
              </span>
              {/*
                `tabular-nums` so the figure does not reflow as the pollers tick.
                The quiet state is white/55 (5.86:1) rather than a dimmer grey,
                which would only have passed at large-text sizes.
              */}
              <span
                className={`mt-2 font-heading text-[32px] leading-none tabular-nums ${
                  value > 0 ? 'text-white' : 'text-white/55'
                }`}
              >
                {value}
              </span>
              <span className="mt-2 inline-flex items-center gap-1 text-[12px] text-white/75">
                {cta}
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
