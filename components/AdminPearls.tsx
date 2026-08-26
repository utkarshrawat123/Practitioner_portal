'use client';

import { useCallback, useEffect, useState } from 'react';

interface Pearl {
  id: number; body: string; category: string | null;
  audience: 'all' | 'qualified' | 'student'; status: 'draft' | 'published'; source: string | null;
}

const label = 'text-[11px] font-medium uppercase tracking-label text-ink2/55';
const input = 'mt-1 w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[15px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50';

export default function AdminPearls() {
  const [rows, setRows] = useState<Pearl[]>([]);
  const [form, setForm] = useState({ body: '', category: '', audience: 'all' as const });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/pearls');
    if (res.ok) setRows((await res.json()).pearls);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const res = await fetch('/api/admin/pearls', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: form.body, category: form.category || null, audience: form.audience, status: 'published' }),
    });
    if (res.ok) { setForm({ body: '', category: '', audience: 'all' }); load(); }
    else setError((await res.json()).error ?? 'Could not save');
  }
  async function patch(id: number, body: Record<string, unknown>) {
    await fetch(`/api/admin/pearls/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    load();
  }
  async function remove(id: number) {
    if (!confirm('Delete this pearl?')) return;
    await fetch(`/api/admin/pearls/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-2">
      <form onSubmit={create} className="grid gap-4 rounded-card bg-white shadow-card p-6">
        <span className={label}>New clinical pearl</span>
        <label className="block"><span className={label}>Tip (one or two sentences)</span>
          <textarea className={input} rows={3} required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={label}>Category (optional)</span>
            <input className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Gut health" /></label>
          <label className="block"><span className={label}>Audience</span>
            <select className={input} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as typeof form.audience })}>
              <option value="all">Everyone</option><option value="qualified">Qualified only</option><option value="student">Students only</option>
            </select></label>
        </div>
        {error && <p className="text-sm text-terracotta">{error}</p>}
        <button className="inline-flex items-center justify-center rounded-pill bg-navy px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-navy-mid disabled:opacity-50 hover:bg-terracotta">Publish pearl</button>
      </form>

      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-ink2/70">No pearls yet.</p>}
        {rows.map((p) => (
          <div key={p.id} className="rounded-card bg-white shadow-card p-3">
            <p className="text-sm text-ink">{p.body}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-ink2/60">
                {p.category ?? 'Uncategorised'} · {p.audience} · {p.status}{p.source === 'content-factory' ? ' · from webinar' : ''}
              </span>
              <div className="flex shrink-0 gap-2 text-xs">
                <button onClick={() => patch(p.id, { status: p.status === 'published' ? 'draft' : 'published' })} className="ring-1 ring-ink/10 px-2 py-1">
                  {p.status === 'published' ? 'Unpublish' : 'Publish'}
                </button>
                <button onClick={() => remove(p.id)} className="rounded-pill px-3 py-1 text-[13px] text-terracotta ring-1 ring-terracotta/30 transition-colors hover:bg-terracotta/10">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
