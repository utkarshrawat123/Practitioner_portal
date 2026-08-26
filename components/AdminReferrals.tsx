'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@/lib/format';

interface Row {
  id: number;
  referrerName: string;
  refereeName: string;
  refereeStatus: string;
  status: string;
  bonusAmount: number;
  currency?: string;
  createdAt: string;
  creditedAt: string | null;
}

export default function AdminReferrals() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState<Row[]>([]);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetch('/api/admin/referrals', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        setRows(d.referrals);
        setTotal(d.totalCredited);
        setPending(d.awaitingApproval ?? []);
        setRequiresApproval(Boolean(d.requiresApproval));
      })
      .catch(() => setRows([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(id: number) {
    setBusyId(id); setError('');
    const res = await fetch(`/api/admin/referrals/${id}/approve`, { method: 'POST' });
    if (res.ok) load();
    else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Could not approve that referral.');
    }
    setBusyId(null);
  }

  const money = (n: number, c?: string) => formatMoney(n, c);

  if (!rows) return <p className="mt-6 text-sm text-ink2/60">Loading…</p>;

  return (
    <div className="mt-6">
      <p className="text-sm text-ink2/70">
        {rows.length} referrals · <span className="text-terracotta">{money(total, 'GBP')} credited</span>
        {requiresApproval && <span className="text-ink2/50"> · admin approval required</span>}
      </p>
      {error && <p className="mt-2 text-sm text-terracotta" role="alert">{error}</p>}

      {/* Approval queue — only populated when REFERRAL_REQUIRE_APPROVAL=true. */}
      {pending.length > 0 && (
        <div className="mt-4 rounded-card bg-blush p-5">
          <h3 className="text-xs uppercase tracking-[0.15em] text-ink2/70">
            Awaiting approval ({pending.length})
          </h3>
          <ul className="mt-3 space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/8 pb-2 text-sm last:border-0">
                <span className="min-w-0">
                  <span className="font-medium text-ink">{r.referrerName}</span>
                  <span className="text-ink2/60"> referred </span>
                  <span className="text-ink">{r.refereeName}</span>
                </span>
                <button
                  onClick={() => approve(r.id)}
                  disabled={busyId === r.id}
                  className="inline-flex items-center justify-center rounded-pill bg-navy px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-navy-mid disabled:opacity-50 disabled:opacity-50"
                >
                  {busyId === r.id ? 'Approving…' : 'Approve credit'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse bg-white text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-[0.1em] text-ink2/70">
              <th className="p-3">Referrer</th><th className="p-3">Referred</th><th className="p-3">Status</th><th className="p-3">Bonus</th><th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-ink/8">
                <td className="p-3 text-ink">{r.referrerName}</td>
                <td className="p-3 text-ink">{r.refereeName} <span className="text-ink2/50">({r.refereeStatus})</span></td>
                <td className="p-3">
                  <span className={r.status === 'credited' ? 'text-terracotta' : 'text-terracotta'}>
                    {r.status === 'clawed_back' ? 'clawed back (refunded)' : r.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="p-3">{r.status === 'credited' ? money(r.bonusAmount, r.currency) : '—'}</td>
                <td className="p-3 text-ink2/60">{r.createdAt?.slice(0, 10)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-sm text-ink2/60">No referrals yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
