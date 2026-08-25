'use client';

import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/format';
import { Button, Card, Empty, Label, Loading } from '@/components/ui';

interface ReferralView {
  id: number;
  refereeName: string;
  refereeStatus: string;
  status:
    | 'invited'
    | 'signed_up'
    | 'first_sale'
    | 'completed'
    | 'awaiting_approval'
    | 'credited'
    | 'clawed_back';
  bonusAmount: number;
  currency?: string;
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
// awaiting_approval sits between "completed" and "credited": the referral has
// qualified but an admin has not signed the payout off yet.
const ORDER = ['invited', 'signed_up', 'first_sale', 'completed', 'awaiting_approval', 'credited'];

function reached(status: string, stageKey: string): boolean {
  // clawed_back is not on the ladder — the credit was reversed after a refund,
  // so no stage reads as achieved and the row is labelled separately below.
  if (status === 'clawed_back') return false;
  return ORDER.indexOf(status) >= ORDER.indexOf(stageKey);
}

/** Right-hand status label for a referral row. */
function statusLabel(status: string, bonusAmount: number, currency: string): string {
  if (status === 'credited') return `${formatMoney(bonusAmount, currency)} ✓`;
  if (status === 'awaiting_approval') return 'awaiting approval';
  if (status === 'clawed_back') return 'refunded — reversed';
  return 'pending';
}

export default function ReferralsApp() {
  const [data, setData] = useState<Data | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/me/referrals').then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data) return <Loading />;

  return (
    <div className="mt-8 space-y-8">
      <Card className="p-6">
        <Label>Your invite link</Label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-blush px-4 py-2.5 text-[14px] text-ink2">{data.inviteLink}</code>
          <Button
            onClick={() => { navigator.clipboard.writeText(data.inviteLink); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="shrink-0"
          >{copied ? 'Copied' : 'Copy link'}</Button>
        </div>
        <p className="mt-5 text-[15px]">
          <span className="font-medium text-terracotta">£{data.earnings.creditedTotal.toFixed(2)} credited</span>
          <span className="text-ink2/60"> · {data.earnings.pendingCount} pending</span>
        </p>
      </Card>

      <div>
        <Label>Your referrals</Label>
        {data.referrals.length === 0 ? (
          <div className="mt-3"><Empty>No referrals yet. Share your link with a colleague to get started.</Empty></div>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.referrals.map((r) => (
              <li key={r.id} className="rounded-card bg-white p-5 shadow-card">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-ink">{r.refereeName}</span>
                  <span className={`shrink-0 text-sm ${r.status === 'credited' ? 'text-olive' : r.status === 'clawed_back' ? 'text-terracotta' : 'text-ink2/60'}`}>
                    {statusLabel(r.status, r.bonusAmount, r.currency ?? 'GBP')}
                  </span>
                </div>
                <ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
                  {STAGES.map((s, i) => (
                    <li key={s.key} className="flex items-center gap-2 sm:flex-1">
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${reached(r.status, s.key) ? 'bg-olive text-white' : 'bg-stone text-ink2/50'}`}>
                        {reached(r.status, s.key) ? '✓' : i + 1}
                      </span>
                      <span className={`text-xs ${reached(r.status, s.key) ? 'text-ink' : 'text-ink2/50'}`}>{s.label}</span>
                      {i < STAGES.length - 1 && <span className="mx-2 hidden h-px flex-1 bg-ink/10 sm:block" />}
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
