'use client';

import { useEffect, useState } from 'react';

interface ReferralView {
  id: number;
  refereeName: string;
  refereeStatus: string;
  status: 'invited' | 'signed_up' | 'first_sale' | 'completed' | 'credited';
  bonusAmount: number;
}
interface Data {
  inviteLink: string;
  earnings: { creditedTotal: number; pendingCount: number };
  referrals: ReferralView[];
}

const STAGES: { key: string; label: string }[] = [
  { key: 'signed_up', label: 'Signed up' },
  { key: 'first_sale', label: 'First purchase' },
  { key: 'completed', label: 'Referral completed' },
  { key: 'credited', label: 'Added to earnings' },
];
const ORDER = ['invited', 'signed_up', 'first_sale', 'completed', 'credited'];

function reached(status: string, stageKey: string): boolean {
  return ORDER.indexOf(status) >= ORDER.indexOf(stageKey);
}

export default function ReferralsApp() {
  const [data, setData] = useState<Data | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/me/referrals').then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data) return <p className="mt-8 text-ink2/60">Loading…</p>;

  return (
    <div className="mt-8 space-y-8">
      <div className="border border-stone bg-white p-5">
        <p className="text-xs uppercase tracking-[0.15em] text-forest">Your invite link</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded bg-cream px-3 py-2 text-sm">{data.inviteLink}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(data.inviteLink); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="shrink-0 bg-forest px-4 py-2 text-xs uppercase tracking-[0.15em] text-cream"
          >{copied ? 'Copied' : 'Copy link'}</button>
        </div>
        <p className="mt-4 text-sm">
          <span className="font-medium text-forest">£{data.earnings.creditedTotal.toFixed(2)} credited</span>
          <span className="text-ink2/60"> · {data.earnings.pendingCount} pending</span>
        </p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.15em] text-ink2/70">Your referrals</p>
        {data.referrals.length === 0 ? (
          <p className="mt-3 text-sm text-ink2/60">No referrals yet. Share your link with a colleague to get started.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.referrals.map((r) => (
              <li key={r.id} className="border border-stone bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-ink">{r.refereeName}</span>
                  <span className={`shrink-0 text-sm ${r.status === 'credited' ? 'text-forest' : 'text-ink2/60'}`}>
                    {r.status === 'credited' ? `£${r.bonusAmount.toFixed(0)} ✓` : 'pending'}
                  </span>
                </div>
                <ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
                  {STAGES.map((s, i) => (
                    <li key={s.key} className="flex items-center gap-2 sm:flex-1">
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${reached(r.status, s.key) ? 'bg-forest text-cream' : 'border border-stone text-ink2/40'}`}>
                        {reached(r.status, s.key) ? '✓' : i + 1}
                      </span>
                      <span className={`text-xs ${reached(r.status, s.key) ? 'text-ink' : 'text-ink2/50'}`}>{s.label}</span>
                      {i < STAGES.length - 1 && <span className="mx-2 hidden h-px flex-1 bg-stone sm:block" />}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
