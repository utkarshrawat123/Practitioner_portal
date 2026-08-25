'use client';

import { useCallback, useEffect, useState } from 'react';

interface Item {
  kind: 'pathway' | 'toolkit' | 'event' | 'widget' | 'pearl' | 'lesson';
  id: number; title: string; status: 'published' | 'draft'; audience: string; date: string;
}

const KIND_LABELS: Record<Item['kind'], string> = {
  pathway: 'Pathway', toolkit: 'Toolkit', event: 'Event',
  widget: 'Homepage', pearl: 'Pearl', lesson: 'Lesson',
};

const KINDS: (Item['kind'] | 'all')[] = ['all', 'pathway', 'lesson', 'toolkit', 'pearl', 'event', 'widget'];

export default function AdminCalendar() {
  const [items, setItems] = useState<Item[]>([]);
  const [kind, setKind] = useState<Item['kind'] | 'all'>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/calendar');
    if (res.ok) setItems((await res.json()).items);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = kind === 'all' ? items : items.filter((i) => i.kind === kind);
  const drafts = items.filter((i) => i.status === 'draft').length;

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink2/70">{items.length} items · <span className="text-terracotta">{drafts} in draft</span></p>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button key={k} onClick={() => setKind(k)}
              className={`rounded-pill px-4 py-1.5 text-[13px] ${kind === k ? 'bg-terracotta-mid text-white' : 'bg-white text-ink2 shadow-card hover:text-ink'}`}>
              {k === 'all' ? 'All' : KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-ink2/60">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-[0.1em] text-ink2/70">
              <th className="p-3">Type</th><th className="p-3">Title</th>
              <th className="p-3">Status</th><th className="p-3">Audience</th><th className="p-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => (
              <tr key={`${i.kind}-${i.id}`} className="border-b border-ink/8">
                <td className="p-3"><span className="bg-sage/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-terracotta">{KIND_LABELS[i.kind]}</span></td>
                <td className="p-3 text-ink">{i.title}</td>
                <td className="p-3">
                  <span className={i.status === 'published' ? 'text-terracotta' : 'text-terracotta'}>{i.status}</span>
                </td>
                <td className="p-3 text-ink2/70">{i.audience}</td>
                <td className="p-3 text-ink2/60">{i.date?.slice(0, 10)}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-sm text-ink2/60">Nothing here yet.</td></tr>}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
