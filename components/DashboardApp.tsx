'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Profile {
  name: string; email: string; registerBody: string; registerNumber: string;
  qualificationStatus: string; tier: string; createdAt: string;
}
interface Me { practitioner: Profile; code: string | null; link: string | null }
interface Stats {
  clicksThisMonth: number; clicksAllTime: number;
  ordersThisMonth: number; ordersAllTime: number;
  revenueThisMonth: number; revenueAllTime: number;
  commissionThisMonth: number; commissionAllTime: number;
  conversionRate: number; lessonsCompleted: number; stale: boolean;
}
interface Widget {
  id: number; title: string; body: string | null;
  linkUrl: string | null; imageUrl: string | null;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_LINKS: { label: string; href: string; ready: boolean }[] = [
  { label: 'Ask Lorna', href: '/assistant', ready: true },
  { label: 'Book Technical Consultation', href: '/coming-soon', ready: false },
  { label: 'Clinical Toolkit', href: '/toolkit', ready: false },
  { label: 'Community', href: '/community', ready: false },
  { label: 'Events', href: '/events', ready: false },
  { label: 'My Downloads', href: '/coming-soon', ready: false },
  { label: 'My CPD', href: '/coming-soon', ready: false },
];

const card = 'border border-stone bg-white p-6';
const label = 'text-xs uppercase tracking-[0.15em] text-ink2/70';
const gbp = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });

function CopyButton({ value, children }: { value: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard unavailable */ }
      }}
      className="bg-ink px-4 py-2 text-xs uppercase tracking-[0.15em] text-cream transition-colors hover:bg-terracotta"
    >
      {copied ? 'Copied ✓' : children}
    </button>
  );
}

function Skeleton() {
  return <div className="h-7 w-24 animate-pulse rounded-sm bg-stone" />;
}

function StatCard({ title, month, allTime }: { title: string; month: string; allTime: string | null }) {
  return (
    <div className={card}>
      <p className={label}>{title}</p>
      <p className="mt-2 font-heading text-3xl text-ink">{month}</p>
      {allTime !== null && <p className="mt-1 text-sm text-ink2/70">{allTime} all time</p>}
    </div>
  );
}

export default function DashboardApp() {
  const [me, setMe] = useState<Me | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStats = useCallback(async () => {
    const res = await fetch('/api/me/stats');
    if (res.ok) setStats(await res.json());
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/me');
      if (res.status === 401) { setAuthed(false); return; }
      setMe(await res.json());
      setAuthed(true);
      loadStats();
      fetch('/api/me/widgets').then(async (r) => { if (r.ok) setWidgets((await r.json()).widgets); });
    })();
  }, [loadStats]);

  useEffect(() => {
    if (!authed) return;
    timer.current = setInterval(loadStats, 60_000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [authed, loadStats]);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/auth/request-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      const body = await res.json();
      setSent(true);
      setDevLink(body.devLink ?? null);
    }
  }

  // ---- Login screen ----
  if (authed === false) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-heading text-3xl text-ink">Practitioner login</h1>
        <p className="mt-3 text-sm text-ink2/80">
          Enter the email you applied with and we&apos;ll send you a secure one-time login link.
        </p>
        {sent ? (
          <div className={`${card} mt-8`}>
            <p className="font-heading text-xl text-ink">Check your email</p>
            <p className="mt-2 text-sm text-ink2/80">
              If an approved practitioner account exists for that address, a login link is on
              its way. It expires in 15 minutes.
            </p>
            {devLink && (
              <p className="mt-4 break-all border-l-2 border-sage bg-cream p-3 text-xs">
                <span className={label}>Test mode — your link:</span>
                <br />
                <a className="text-terracotta underline" href={devLink}>{devLink}</a>
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={requestLink} className={`${card} mt-8`}>
            <label htmlFor="email" className={label}>Email address</label>
            <input
              id="email" type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full border border-stone px-4 py-3 focus:border-terracotta focus:outline-none"
              placeholder="you@practice.com"
            />
            <button className="mt-5 w-full bg-ink px-6 py-3 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta">
              Send login link
            </button>
          </form>
        )}
      </div>
    );
  }

  // ---- Loading shell ----
  if (authed === null || !me) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="h-9 w-64 animate-pulse rounded-sm bg-stone" />
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className={`${card} h-28 animate-pulse`} />)}
        </div>
      </div>
    );
  }

  const p = me.practitioner;
  const empty = stats && !stats.stale && stats.clicksAllTime === 0 && stats.ordersAllTime === 0;

  // ---- Homepage ----
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {/* Greeting */}
      <p className={label}>Practitioner Hub</p>
      <h1 className="mt-1 font-heading text-3xl text-ink md:text-4xl">
        {greeting()}, {p.name.split(' ')[0]}
      </h1>

      {/* Continue Learning */}
      <div className={`${card} mt-8 flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <p className={label}>Continue learning</p>
          <p className="mt-2 font-heading text-3xl text-ink">
            {stats ? stats.lessonsCompleted : '—'} <span className="text-base text-ink2/60">lessons completed</span>
          </p>
          <p className="mt-1 text-xs text-ink2/60">Pathway progress arrives with Learning Pathways.</p>
        </div>
        <a href="/library" className="bg-forest px-6 py-3 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta">
          Open the learning library
        </a>
      </div>

      {/* What's New */}
      {widgets.length > 0 && (
        <section className="mt-8">
          <p className={label}>What&apos;s new</p>
          <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
            {widgets.map((w) => {
              const inner = (
                <>
                  {w.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.imageUrl} alt="" className="mb-3 h-32 w-full rounded-sm object-cover" />
                  )}
                  <p className="font-heading text-lg text-ink">{w.title}</p>
                  {w.body && <p className="mt-1 text-sm text-ink2/70">{w.body}</p>}
                </>
              );
              return w.linkUrl ? (
                <a key={w.id} href={w.linkUrl} className={`${card} block w-64 shrink-0 transition-colors hover:border-terracotta`}>{inner}</a>
              ) : (
                <div key={w.id} className={`${card} w-64 shrink-0`}>{inner}</div>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick Links */}
      <section className="mt-8">
        <p className={label}>Quick links</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((q) => (
            <a key={q.label} href={q.href}
              className={`${card} flex items-center justify-between transition-colors hover:border-terracotta`}>
              <span className="font-heading text-lg text-ink">{q.label}</span>
              {!q.ready && <span className="text-[10px] uppercase tracking-[0.15em] text-ink2/50">Coming soon</span>}
            </a>
          ))}
        </div>
      </section>

      {/* Your referrals (compact) */}
      <section className="mt-8">
        <p className={label}>Your referrals</p>
        <div className={`${card} mt-3`}>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className={label}>Referral code</p>
              <p className="mt-2 font-heading text-3xl text-terracotta">{me.code}</p>
              <div className="mt-3"><CopyButton value={me.code ?? ''}>Copy code</CopyButton></div>
            </div>
            <div>
              <p className={label}>Referral link</p>
              <p className="mt-2 break-all text-sm text-ink2/90">{me.link}</p>
              <div className="mt-3"><CopyButton value={me.link ?? ''}>Copy link</CopyButton></div>
            </div>
          </div>
          {stats?.stale && (
            <p className="mt-4 border-l-2 border-terracotta bg-cream px-4 py-2 text-xs text-ink2/80">
              Live stats are temporarily unavailable — showing the most recent figures.
            </p>
          )}
          {empty && (
            <div className="mt-4 border-l-2 border-terracotta bg-cream px-4 py-3 text-sm text-ink2/80">
              <span className="font-semibold text-ink">Share your link to start earning.</span>{' '}
              No referrals yet — share your code with clients, and the figures below update
              automatically as orders come in.
            </div>
          )}
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {stats ? (
              <>
                <StatCard title="Clicks this month" month={String(stats.clicksThisMonth)} allTime={`${stats.clicksAllTime}`} />
                <StatCard title="Orders this month" month={String(stats.ordersThisMonth)} allTime={`${stats.ordersAllTime}`} />
                <StatCard title="Conversion rate" month={`${stats.conversionRate}%`} allTime={null} />
                <StatCard title="Commission this month" month={gbp(stats.commissionThisMonth)} allTime={gbp(stats.commissionAllTime)} />
              </>
            ) : (
              [0, 1, 2, 3].map((i) => <div key={i} className={card}><Skeleton /></div>)
            )}
          </div>
        </div>
      </section>

      {/* Tier (slim) */}
      <div className={`${card} mt-8 flex items-center justify-between`}>
        <div>
          <p className={label}>Your tier</p>
          <p className="mt-1 font-heading text-2xl capitalize text-forest">{p.tier}</p>
        </div>
        <p className="max-w-xs text-right text-xs text-ink2/60">Tiering automation arrives in a later release.</p>
      </div>
    </div>
  );
}
