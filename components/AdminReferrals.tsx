'use client';

import { useEffect, useState } from 'react';

interface Row {
  id: number;
  referrerName: string;
  refereeName: string;
  refereeStatus: string;
  status: string;
  bonusAmount: number;
  createdAt: string;
  creditedAt: string | null;
}

export default function AdminReferrals() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch('/api/admin/referrals')
      .then((r) => r.json())
      .then((d) => { setRows(d.referrals); setTotal(d.totalCredited); })
      .catch(() => setRows([]));
  }, []);

  if (!rows) return <p className="mt-6 text-sm text-ink2/60">Loading…</p>;

  return (
    <div className="mt-6">
      <p className="text-sm text-ink2/70">{rows.length} referrals · <span className="text-forest">£{total.toFixed(2)} credited</span></p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse bg-white text-sm">
          <thead>
            <tr className="border-b border-stone text-left text-xs uppercase tracking-[0.1em] text-ink2/70">
              <th className="p-3">Referrer</th><th className="p-3">Referred</th><th className="p-3">Status</th><th className="p-3">Bonus</th><th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-stone/60">
                <td className="p-3 text-ink">{r.referrerName}</td>
                <td className="p-3 text-ink">{r.refereeName} <span className="text-ink2/50">({r.refereeStatus})</span></td>
                <td className="p-3"><span className={r.status === 'credited' ? 'text-forest' : 'text-terracotta'}>{r.status}</span></td>
                <td className="p-3">{r.status === 'credited' ? `£${r.bonusAmount.toFixed(2)}` : '—'}</td>
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
