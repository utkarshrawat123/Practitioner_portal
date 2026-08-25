'use client';

import { useCallback, useEffect, useState } from 'react';

interface Stats {
  totalConversations: number; totalMessages: number; practitionerMessages: number;
  adminMessages: number; openConversations: number; uniquePractitioners: number;
  byMonth: { month: string; conversations: number; messages: number }[];
  byWeekday: { weekday: number; messages: number }[];
  byHour: { hour: number; messages: number }[];
  topPractitioners: { practitionerId: number; name: string; messages: number }[];
}
interface Faq { question: string; suggestedAnswer: string; frequency: number; examples: string[] }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card bg-white shadow-card px-4 py-3">
      <p className="text-2xl font-heading text-ink">{value}</p>
      <p className="text-[11px] uppercase tracking-[0.12em] text-ink2/60">{label}</p>
    </div>
  );
}

/** Chat Insights: always-on stats + optional AI FAQ consolidation. */
export default function ChatInsights() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [keywords, setKeywords] = useState<{ term: string; count: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [faqs, setFaqs] = useState<Faq[] | null>(null);
  const [narrative, setNarrative] = useState('');
  const [faqBusy, setFaqBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');

  const qs = useCallback(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return p.toString();
  }, [from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/chat/insights?${qs()}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setStats(data.stats);
      setKeywords(data.keywords);
    }
    setLoading(false);
  }, [qs]);

  useEffect(() => { load(); }, [load]);

  async function consolidate() {
    setFaqBusy(true);
    setAiNote('');
    const res = await fetch('/api/admin/chat/insights/faqs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from || null, to: to || null }),
    });
    const data = await res.json();
    if (data.aiAvailable) {
      setFaqs(data.faqs);
      setNarrative(data.narrative);
    } else {
      setFaqs(null);
      setAiNote(`AI temporarily unavailable — ${data.reason ?? 'try again later'}. Stats below are unaffected.`);
    }
    setFaqBusy(false);
  }

  const maxWd = Math.max(1, ...(stats?.byWeekday.map((w) => w.messages) ?? [1]));

  return (
    <div className="mt-6 space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs uppercase tracking-[0.12em] text-ink2/70">
          From<br />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[14px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50" />
        </label>
        <label className="text-xs uppercase tracking-[0.12em] text-ink2/70">
          To<br />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[14px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50" />
        </label>
        <button onClick={load} className="inline-flex items-center justify-center rounded-pill bg-navy px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-navy-mid disabled:opacity-50 hover:bg-terracotta">
          Apply
        </button>
        <a href={`/api/admin/chat/insights?export=csv&${qs()}`}
          className="inline-flex items-center justify-center rounded-pill bg-white px-4 py-2 text-[13px] text-ink ring-1 ring-ink/12 transition-colors hover:ring-ink/30">
          Export CSV
        </a>
      </div>

      {loading && <p className="text-sm text-ink2/60">Loading…</p>}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Stat label="Conversations" value={stats.totalConversations} />
            <Stat label="Open" value={stats.openConversations} />
            <Stat label="Messages" value={stats.totalMessages} />
            <Stat label="From practitioners" value={stats.practitionerMessages} />
            <Stat label="From admin" value={stats.adminMessages} />
            <Stat label="Practitioners" value={stats.uniquePractitioners} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Monthly volume */}
            <div className="rounded-card bg-white shadow-card p-4">
              <h4 className="mb-3 text-xs uppercase tracking-[0.15em] text-ink2/70">Monthly volume</h4>
              {stats.byMonth.length === 0 ? <p className="text-sm text-ink2/50">No data.</p> : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {stats.byMonth.map((m) => (
                      <tr key={m.month} className="border-b border-ink/8">
                        <td className="py-1.5">{m.month}</td>
                        <td className="py-1.5 text-right text-ink2/70">{m.conversations} convos</td>
                        <td className="py-1.5 text-right font-medium">{m.messages} msgs</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* Busiest weekday */}
            <div className="rounded-card bg-white shadow-card p-4">
              <h4 className="mb-3 text-xs uppercase tracking-[0.15em] text-ink2/70">Busiest day</h4>
              <div className="space-y-1.5">
                {WEEKDAYS.map((label, wd) => {
                  const n = stats.byWeekday.find((x) => x.weekday === wd)?.messages ?? 0;
                  return (
                    <div key={wd} className="flex items-center gap-2 text-xs">
                      <span className="w-9 text-ink2/70">{label}</span>
                      <div className="h-3 flex-1 bg-stone/40">
                        <div className="h-3 bg-navy" style={{ width: `${(n / maxWd) * 100}%` }} />
                      </div>
                      <span className="w-8 text-right text-ink2/70">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Top practitioners */}
            <div className="rounded-card bg-white shadow-card p-4">
              <h4 className="mb-3 text-xs uppercase tracking-[0.15em] text-ink2/70">Most active practitioners</h4>
              {stats.topPractitioners.length === 0 ? <p className="text-sm text-ink2/50">No data.</p> : (
                <ol className="space-y-1 text-sm">
                  {stats.topPractitioners.map((p) => (
                    <li key={p.practitionerId} className="flex justify-between border-b border-ink/8 py-1">
                      <span>{p.name}</span><span className="text-ink2/70">{p.messages}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Keywords */}
            <div className="rounded-card bg-white shadow-card p-4">
              <h4 className="mb-3 text-xs uppercase tracking-[0.15em] text-ink2/70">Most-asked terms</h4>
              {keywords.length === 0 ? <p className="text-sm text-ink2/50">No data.</p> : (
                <div className="flex flex-wrap gap-2">
                  {keywords.map((k) => (
                    <span key={k.term} className="rounded-full bg-cream px-3 py-1 text-xs text-ink2">
                      {k.term} <span className="text-ink2/50">×{k.count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* AI FAQ consolidation */}
          <div className="rounded-card bg-white shadow-card p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs uppercase tracking-[0.15em] text-ink2/70">FAQ consolidation (AI)</h4>
              <button onClick={consolidate} disabled={faqBusy}
                className="inline-flex items-center justify-center rounded-pill bg-navy px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-navy-mid disabled:opacity-50 disabled:opacity-50">
                {faqBusy ? 'Analysing…' : 'Consolidate FAQs'}
              </button>
            </div>
            {aiNote && <p className="mt-3 rounded bg-cream px-3 py-2 text-sm text-terracotta">{aiNote}</p>}
            {narrative && <p className="mt-3 text-sm text-ink2">{narrative}</p>}
            {faqs && faqs.length > 0 && (
              <div className="mt-4 space-y-3">
                {faqs.map((f, i) => (
                  <div key={i} className="rounded-xl ring-1 ring-ink/8 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-ink">{f.question}</p>
                      <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-[11px] text-ink2/70">×{f.frequency}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink2">{f.suggestedAnswer}</p>
                  </div>
                ))}
              </div>
            )}
            {faqs && faqs.length === 0 && !aiNote && (
              <p className="mt-3 text-sm text-ink2/60">No questions to consolidate in this period.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
