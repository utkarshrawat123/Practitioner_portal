'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Card, Label, SectionTitle, Pill, Button, ActionLink, Progress, Page } from '@/components/ui';
import { formatMoney } from '@/lib/format';

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
interface PathwayCard {
  id: number; title: string; cpdHours: number;
  progress: { percent: number; complete: boolean };
}
interface Pearl { id: number; body: string; category: string | null }

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_LINKS: { label: string; href: string; featured?: boolean }[] = [
  { label: 'Ask the Expert', href: '/assistant', featured: true },
  { label: 'Resource Library', href: '/resources' },
  { label: 'Lessons', href: '/library' },
  { label: 'Clinical Toolkit', href: '/toolkit' },
  { label: 'Community', href: '/community' },
  { label: 'Events', href: '/events' },
  { label: 'Leaderboard', href: '/leaderboard' },
  { label: 'My CPD', href: '/cpd' },
  { label: 'Refer & Earn', href: '/referrals' },
];

const gbp = (n: number) => formatMoney(n, 'GBP');

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
      className="rounded-pill ring-1 ring-ink/15 bg-white px-4 py-2 text-[12px] text-ink transition-colors hover:border-ink/30"
    >
      {copied ? 'Copied ✓' : children}
    </button>
  );
}

function Skeleton() {
  return <div className="h-7 w-24 animate-pulse rounded-pill bg-ink/10" />;
}

function StatCard({ title, month, allTime }: { title: string; month: string; allTime: string | null }) {
  return (
    <Card className="p-5">
      <Label>{title}</Label>
      <p className="mt-2 font-heading text-[28px] leading-none text-ink">{month}</p>
      {allTime !== null && <p className="mt-2 text-[13px] text-ink2/60">{allTime} all time</p>}
    </Card>
  );
}

export default function DashboardApp() {
  const [me, setMe] = useState<Me | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [pathways, setPathways] = useState<PathwayCard[]>([]);
  const [pearls, setPearls] = useState<Pearl[]>([]);
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
      fetch('/api/me/pathways').then(async (r) => { if (r.ok) setPathways((await r.json()).pathways); });
      fetch('/api/me/pearls').then(async (r) => { if (r.ok) setPearls((await r.json()).pearls); });
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
      <div className="mx-auto max-w-md px-6 py-20">
        <h1 className="font-heading text-[34px] leading-tight text-ink">Practitioner login</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink2/75">
          Enter the email you applied with and we&apos;ll send you a secure one-time login link.
        </p>
        {sent ? (
          <Card className="mt-8 p-6">
            <p className="font-heading text-[22px] text-ink">Check your email</p>
            <p className="mt-2 text-[14px] leading-relaxed text-ink2/75">
              If an approved practitioner account exists for that address, a login link is on
              its way. It expires in 15 minutes.
            </p>
            {devLink && (
              <div className="mt-5 rounded-xl bg-sage-pale p-4">
                <Label>Test mode — your link</Label>
                <a className="mt-1.5 block break-all text-[13px] text-terracotta underline" href={devLink}>
                  {devLink}
                </a>
              </div>
            )}
          </Card>
        ) : (
          <Card className="mt-8 p-6">
            <form onSubmit={requestLink}>
              <label htmlFor="email" className="text-[11px] font-medium uppercase tracking-label text-ink2/55">
                Email address
              </label>
              <input
                id="email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-xl ring-1 ring-ink/12 bg-cream px-4 py-3 text-[15px] outline-none transition-colors focus:border-terracotta-mid"
                placeholder="you@practice.com"
              />
              <Button type="submit" className="mt-5 w-full">Send login link</Button>
            </form>
          </Card>
        )}
      </div>
    );
  }

  // ---- Loading shell ----
  if (authed === null || !me) {
    return (
      <Page>
        <div className="h-10 w-72 animate-pulse rounded-pill bg-ink/10" />
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="h-28 animate-pulse p-6" />
          ))}
        </div>
      </Page>
    );
  }

  const p = me.practitioner;
  const empty = stats && !stats.stale && stats.clicksAllTime === 0 && stats.ordersAllTime === 0;

  const inProgress = pathways
    .filter((x) => x.progress.percent > 0 && !x.progress.complete)
    .sort((a, b) => b.progress.percent - a.progress.percent);
  const current = inProgress[0] ?? pathways.find((x) => x.progress.percent === 0) ?? null;

  return (
    <Page>
      {/* ---- Navy hero: greeting + continue learning ---- */}
      <section className="rounded-card bg-navy px-7 py-8 text-white lg:px-10 lg:py-10">
        <h1 className="font-heading text-[30px] leading-tight lg:text-[38px]">
          {greeting()}, {p.name.split(' ')[0]}
        </h1>
        <p className="mt-1.5 text-[15px] text-white/60">Welcome back to your Practitioner Platform</p>

        <div className="mt-7 border-t border-white/12 pt-7">
          <p className="text-[15px] font-medium text-white/90">Continue learning</p>
          {current ? (
            <div className="mt-4 overflow-hidden rounded-xl bg-blush">
              <div className="p-6">
                <p className="text-[13px] text-ink2/60">
                  {current.cpdHours} CPD hours
                </p>
                <p className="mt-1 font-heading text-[24px] leading-tight text-ink">{current.title}</p>
                <p className="mt-4 text-[13px] text-ink2/70">{current.progress.percent}% complete</p>
                <Progress value={current.progress.percent} className="mt-2 max-w-md" />
                <Button href={`/learning/${current.id}`} className="mt-5">
                  {current.progress.percent > 0 ? 'Continue' : 'Start pathway'} →
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-blush p-6">
              <div>
                <p className="font-heading text-[26px] leading-none text-ink">
                  {stats ? stats.lessonsCompleted : '—'}{' '}
                  <span className="font-body text-[15px] text-ink2/60">lessons completed</span>
                </p>
                <p className="mt-2 text-[13px] text-ink2/70">
                  Explore structured pathways to earn CPD certificates.
                </p>
              </div>
              <Button href="/learning">Browse pathways →</Button>
            </div>
          )}
        </div>
      </section>

      {/* ---- Clinical pearl ---- */}
      {pearls.length > 0 && (
        <Card tone="blush" className="mt-6 flex items-start gap-3.5 p-6">
          <Sparkles className="mt-0.5 h-[18px] w-[18px] shrink-0 text-terracotta" strokeWidth={1.7} aria-hidden />
          <div>
            <Label>Clinical pearl{pearls[0].category ? ` · ${pearls[0].category}` : ''}</Label>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink2/90">{pearls[0].body}</p>
          </div>
        </Card>
      )}

      {/* ---- What's new ---- */}
      {widgets.length > 0 && (
        <section className="mt-10">
          <SectionTitle>What&apos;s new</SectionTitle>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {widgets.map((w, i) => (
              <Card key={w.id} tone="blush" className="overflow-hidden">
                {w.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.imageUrl} alt="" className="h-36 w-full object-cover" />
                )}
                <div className="p-6">
                  <Pill tone={i % 3 === 0 ? 'terracotta' : i % 3 === 1 ? 'sage' : 'outline'}>
                    {i % 3 === 0 ? 'Upcoming' : i % 3 === 1 ? 'New resource' : 'Update'}
                  </Pill>
                  <p className="mt-3 font-heading text-[20px] leading-snug text-ink">{w.title}</p>
                  {w.body && <p className="mt-2 text-[14px] leading-relaxed text-ink2/70">{w.body}</p>}
                  {w.linkUrl && <ActionLink href={w.linkUrl}>Read more</ActionLink>}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ---- Quick links ---- */}
      <section className="mt-10">
        <SectionTitle>Quick links</SectionTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((q) =>
            q.featured ? (
              <Link
                key={q.label}
                href={q.href}
                className="quick-shine group relative flex items-center justify-between overflow-hidden rounded-card bg-navy p-6 text-white shadow-card transition-shadow hover:shadow-lift"
              >
                <span className="flex items-center gap-2.5 font-heading text-[20px]">
                  <Sparkles className="h-[18px] w-[18px] shrink-0 text-terracotta-light" strokeWidth={1.7} aria-hidden />
                  {q.label}
                </span>
                <span className="relative rounded-pill bg-white/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-label">
                  AI
                </span>
              </Link>
            ) : (
              <Card key={q.label} href={q.href} className="flex items-center justify-between p-6">
                <span className="font-heading text-[20px] text-ink">{q.label}</span>
                <span className="text-ink2/35 transition-transform group-hover:translate-x-0.5">→</span>
              </Card>
            )
          )}
        </div>
      </section>

      {/* ---- Referrals ---- */}
      <section className="mt-10">
        <SectionTitle>Your referrals</SectionTitle>
        <Card className="p-7">
          <div className="grid gap-7 md:grid-cols-2">
            <div>
              <Label>Referral code</Label>
              <p className="mt-2 font-heading text-[30px] leading-none text-terracotta">{me.code}</p>
              <div className="mt-4"><CopyButton value={me.code ?? ''}>Copy code</CopyButton></div>
            </div>
            <div className="min-w-0">
              <Label>Referral link</Label>
              <p className="mt-2 break-all text-[14px] text-ink2/80">{me.link}</p>
              <div className="mt-4"><CopyButton value={me.link ?? ''}>Copy link</CopyButton></div>
            </div>
          </div>

          {stats?.stale && (
            <p className="mt-6 rounded-xl bg-sage-pale px-4 py-3 text-[13px] text-ink2/80">
              Live stats are temporarily unavailable — showing the most recent figures.
            </p>
          )}
          {empty && (
            <div className="mt-6 rounded-xl bg-blush-deep px-5 py-4 text-[14px] text-ink2/80">
              <span className="font-semibold text-ink">Share your link to start earning.</span>{' '}
              No referrals yet — share your code with clients, and these figures update
              automatically as orders come in.
            </div>
          )}

          <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {stats ? (
              <>
                <StatCard title="Clicks this month" month={String(stats.clicksThisMonth)} allTime={`${stats.clicksAllTime}`} />
                <StatCard title="Orders this month" month={String(stats.ordersThisMonth)} allTime={`${stats.ordersAllTime}`} />
                <StatCard title="Conversion rate" month={`${stats.conversionRate}%`} allTime={null} />
                <StatCard title="Commission this month" month={gbp(stats.commissionThisMonth)} allTime={gbp(stats.commissionAllTime)} />
              </>
            ) : (
              [0, 1, 2, 3].map((i) => <Card key={i} className="p-5"><Skeleton /></Card>)
            )}
          </div>
        </Card>
      </section>

      {/* ---- Tier ---- */}
      <Card tone="blush" className="mt-6 flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <Label>Your tier</Label>
          <p className="mt-1.5 font-heading text-[24px] capitalize text-ink">{p.tier}</p>
        </div>
        <p className="max-w-xs text-[13px] text-ink2/60 sm:text-right">
          Tiering automation arrives in a later release.
        </p>
      </Card>
    </Page>
  );
}
