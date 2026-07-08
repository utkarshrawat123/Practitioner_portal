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
  conversionRate: number; stale: boolean;
}

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

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthed(false);
    setMe(null);
    setStats(null);
    setSent(false);
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

  // ---- Dashboard ----
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className={label}>Practitioner dashboard</p>
          <h1 className="mt-1 font-heading text-3xl text-ink md:text-4xl">Welcome back, {p.name.split(' ')[0]}</h1>
        </div>
        <div className="flex items-baseline gap-5">
          <a href="/assistant" className="text-xs uppercase tracking-[0.15em] text-terracotta underline">
            Protocol Assistant
          </a>
          <button onClick={logout} className="text-xs uppercase tracking-[0.15em] text-ink2/70 underline hover:text-terracotta">
            Log out
          </button>
        </div>
      </div>

      {/* Referral assets */}
      <div className={`${card} mt-8`}>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className={label}>Your referral code</p>
            <p className="mt-2 font-heading text-3xl text-terracotta">{me.code}</p>
            <div className="mt-3"><CopyButton value={me.code ?? ''}>Copy code</CopyButton></div>
          </div>
          <div>
            <p className={label}>Your referral link</p>
            <p className="mt-2 break-all text-sm text-ink2/90">{me.link}</p>
            <div className="mt-3"><CopyButton value={me.link ?? ''}>Copy link</CopyButton></div>
          </div>
        </div>
      </div>

      {stats?.stale && (
        <p className="mt-4 border-l-2 border-terracotta bg-cream px-4 py-2 text-xs text-ink2/80">
          Live stats are temporarily unavailable — showing the most recent figures.
        </p>
      )}

      {/* Stats */}
      {empty ? (
        <div className={`${card} mt-6 text-center`}>
          <p className="font-heading text-2xl text-ink">Share your link to start earning</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink2/80">
            No referrals yet. Share your code with clients — every order placed with it earns
            you commission, and your numbers will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {stats ? (
            <>
              <StatCard title="Clicks this month" month={String(stats.clicksThisMonth)} allTime={`${stats.clicksAllTime}`} />
              <StatCard title="Orders this month" month={String(stats.ordersThisMonth)} allTime={`${stats.ordersAllTime}`} />
              <StatCard title="Conversion rate" month={`${stats.conversionRate}%`} allTime={null} />
              <StatCard title="Commission this month" month={gbp(stats.commissionThisMonth)} allTime={gbp(stats.commissionAllTime)} />
            </>
          ) : (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className={card}><Skeleton /></div>
            ))
          )}
        </div>
      )}

      {/* Tier + profile */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className={card}>
          <p className={label}>Your tier</p>
          <p className="mt-2 font-heading text-3xl capitalize text-forest">{p.tier}</p>
          <p className="mt-2 text-xs text-ink2/60">Tiering criteria coming soon.</p>
        </div>
        <div className={card}>
          <p className={label}>Profile</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="inline font-semibold">Name: </dt><dd className="inline">{p.name}</dd></div>
            <div><dt className="inline font-semibold">Email: </dt><dd className="inline">{p.email}</dd></div>
            <div><dt className="inline font-semibold">Register: </dt><dd className="inline">{p.registerBody} #{p.registerNumber}</dd></div>
            <div><dt className="inline font-semibold">Status: </dt><dd className="inline capitalize">{p.qualificationStatus}</dd></div>
            <div><dt className="inline font-semibold">Member since: </dt><dd className="inline">{p.createdAt.slice(0, 10)}</dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
}
