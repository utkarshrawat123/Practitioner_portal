'use client';

import { useEffect, useMemo, useState } from 'react';

interface ReportRow {
  id: number; name: string; email: string; status: string; tier: 'standard' | 'silver' | 'gold';
  referredRevenue: number; orders: number; clicks: number; conversionRate: number;
  engagementScore: number; lessonsCompleted: number; lastLoginAt: string | null;
  lastReferralAt: string | null; dormant: boolean; churnRisk: boolean; powerUser: boolean;
  dataWarning: boolean;
}
interface Summary {
  total: number; powerUsers: number; churnRisk: number; dormant: number;
  byTier: { standard: number; silver: number; gold: number };
}

type SortKey = keyof ReportRow;

const label = 'text-[11px] font-medium uppercase tracking-label text-ink2/55';
const gbp = (n: number) => n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const tierLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');

const COLUMNS: { key: SortKey; label: string; render: (r: ReportRow) => React.ReactNode }[] = [
  { key: 'name', label: 'Practitioner', render: (r) => (
    <span>{r.name}<br /><span className="text-xs text-ink2/60">{r.email}</span></span>
  ) },
  { key: 'tier', label: 'Tier', render: (r) => tierLabel(r.tier) },
  { key: 'referredRevenue', label: 'Revenue (12m)', render: (r) => gbp(r.referredRevenue) },
  { key: 'orders', label: 'Orders', render: (r) => r.orders },
  { key: 'clicks', label: 'Clicks', render: (r) => r.clicks },
  { key: 'conversionRate', label: 'Conv %', render: (r) => `${r.conversionRate}%` },
  { key: 'engagementScore', label: 'Engagement', render: (r) => r.engagementScore },
  { key: 'lessonsCompleted', label: 'Lessons', render: (r) => r.lessonsCompleted },
  { key: 'lastLoginAt', label: 'Last login', render: (r) => day(r.lastLoginAt) },
];

export default function AdminReporting() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('referredRevenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [tierFilter, setTierFilter] = useState('');
  const [flagFilter, setFlagFilter] = useState<'' | 'power' | 'churn' | 'dormant'>('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/reporting');
      if (res.ok) {
        const body = await res.json();
        setRows(body.rows);
        setSummary(body.summary);
      }
      setLoading(false);
    })();
  }, []);

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  const view = useMemo(() => {
    let out = rows.filter((r) => {
      if (tierFilter && r.tier !== tierFilter) return false;
      if (flagFilter === 'power' && !r.powerUser) return false;
      if (flagFilter === 'churn' && !r.churnRisk) return false;
      if (flagFilter === 'dormant' && !r.dormant) return false;
      if (search && !`${r.name} ${r.email}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [rows, tierFilter, flagFilter, search, sortKey, sortDir]);

  if (loading) {
    return <div className="mt-6 h-32 animate-pulse rounded-card bg-stone/60" />;
  }

  return (
    <div className="mt-6">
      {/* Summary chips */}
      {summary && (
        <div className="flex flex-wrap gap-3">
          {[
            `${summary.total} practitioners`,
            `${summary.powerUsers} power users`,
            `${summary.churnRisk} churn risk`,
            `${summary.dormant} dormant`,
            `${summary.byTier.gold} Gold · ${summary.byTier.silver} Silver · ${summary.byTier.standard} Standard`,
          ].map((chip, i) => (
            <span key={i} className="rounded-card bg-white shadow-card px-4 py-2 text-xs uppercase tracking-[0.1em] text-ink2/80">
              {chip}
            </span>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="mt-5 flex flex-wrap items-end gap-4">
        <div>
          <label className={label}>Tier</label>
          <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}
            className="mt-1 block w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[14px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50">
            <option value="">All</option>
            <option value="gold">Gold</option>
            <option value="silver">Silver</option>
            <option value="standard">Standard</option>
          </select>
        </div>
        <div>
          <label className={label}>Flag</label>
          <select value={flagFilter} onChange={(e) => setFlagFilter(e.target.value as any)}
            className="mt-1 block w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[14px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50">
            <option value="">All</option>
            <option value="power">Power users</option>
            <option value="churn">Churn risk</option>
            <option value="dormant">Dormant</option>
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className={label}>Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email…"
            className="mt-1 block w-full w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[14px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50" />
        </div>
        <a href="/api/admin/reporting/export"
          className="inline-flex items-center justify-center rounded-pill bg-navy px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-navy-mid disabled:opacity-50 hover:bg-terracotta">
          Export CSV
        </a>
      </div>

      {/* Table */}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse bg-white text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-[0.1em] text-ink2/70">
              {COLUMNS.map((c) => (
                <th key={c.key} onClick={() => sortBy(c.key)} className="cursor-pointer select-none p-3 hover:text-terracotta">
                  {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              <th className="p-3">Flags</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.id} className={`border-b border-ink/8 align-top ${r.churnRisk ? 'bg-terracotta/5' : ''}`}>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="p-3">{c.render(r)}</td>
                ))}
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {r.powerUser && <span className="bg-sage/50 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-terracotta">Power</span>}
                    {r.churnRisk && <span className="bg-terracotta/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-terracotta">Churn</span>}
                    {r.dormant && <span className="bg-stone/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-ink2/70">Dormant</span>}
                    {r.dataWarning && <span title="Revenue data unavailable" className="text-[10px] uppercase tracking-[0.1em] text-ink2/50">no data</span>}
                  </div>
                </td>
              </tr>
            ))}
            {view.length === 0 && (
              <tr><td colSpan={COLUMNS.length + 1} className="p-6 text-center text-ink2/60">No practitioners match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
