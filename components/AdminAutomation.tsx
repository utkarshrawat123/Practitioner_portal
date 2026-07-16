'use client';

import { useCallback, useEffect, useState } from 'react';

interface Run { job: string; status: string; detail: string | null; ranAt: string }
interface EmailRow { practitionerId: number; job: string; period: string; detail: string | null; sentAt: string }
interface Optin { practitionerId: number; displayName: string | null }
const label = 'text-xs uppercase tracking-[0.15em] text-ink2/70';
const JOB_LABELS: Record<string, string> = { tiering: 'Tier recalculation', re_engagement: 'Re-engagement emails', quarterly: 'Quarterly impact report' };

export default function AdminAutomation() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [optins, setOptins] = useState<Optin[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/automation');
    if (r.ok) { const b = await r.json(); setRuns(b.runs); setEmails(b.emails); setOptins(b.optins); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function runNow() {
    setBusy(true);
    await fetch('/api/admin/automation/run', { method: 'POST' });
    setBusy(false);
    load();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <span className={label}>Scheduled jobs</span>
        <button onClick={runNow} disabled={busy} className="bg-ink px-5 py-2 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta disabled:opacity-60">{busy ? 'Running…' : 'Run all now'}</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {['tiering', 're_engagement', 'quarterly'].map((job) => {
          const run = runs.find((r) => r.job === job);
          return (
            <div key={job} className="border border-stone bg-white p-4">
              <p className="font-heading text-ink">{JOB_LABELS[job]}</p>
              {run ? (
                <>
                  <p className={`mt-1 text-xs ${run.status === 'ok' ? 'text-forest' : 'text-terracotta'}`}>{run.status.toUpperCase()} · {run.ranAt.slice(0, 16).replace('T', ' ')}</p>
                  <p className="mt-1 truncate text-xs text-ink2/60">{run.detail}</p>
                </>
              ) : <p className="mt-1 text-xs text-ink2/50">Never run</p>}
            </div>
          );
        })}
      </div>

      <div>
        <span className={label}>Leaderboard opt-ins ({optins.length})</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {optins.length === 0 && <p className="text-sm text-ink2/60">None yet.</p>}
          {optins.map((o) => <span key={o.practitionerId} className="border border-stone px-3 py-1 text-xs">{o.displayName || `#${o.practitionerId}`}</span>)}
        </div>
      </div>

      <div>
        <span className={label}>Recent lifecycle emails</span>
        <div className="mt-2 space-y-1">
          {emails.length === 0 && <p className="text-sm text-ink2/60">No emails sent yet.</p>}
          {emails.map((e, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-2 border border-stone bg-white px-3 py-2 text-xs">
              <span className="font-medium">{JOB_LABELS[e.job] ?? e.job} · #{e.practitionerId} · {e.period}</span>
              <span className="text-ink2/50">{e.detail} · {e.sentAt.slice(0, 16).replace('T', ' ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
