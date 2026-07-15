'use client';

import { useCallback, useEffect, useState } from 'react';

interface Widget {
  id: number; title: string; body: string | null; linkUrl: string | null;
  imageUrl: string | null; audience: 'all' | 'qualified' | 'student';
  position: number; published: boolean; createdAt: string;
}

const empty = { title: '', body: '', linkUrl: '', imageUrl: '', audience: 'all' as const };
const label = 'text-xs uppercase tracking-[0.15em] text-ink2/70';
const input = 'mt-1 w-full border border-stone px-3 py-2 focus:border-terracotta focus:outline-none';

export default function AdminWidgets() {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [form, setForm] = useState({ ...empty });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/widgets');
    if (res.ok) setWidgets((await res.json()).widgets);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await fetch('/api/admin/widgets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        body: form.body || null,
        linkUrl: form.linkUrl || null,
        imageUrl: form.imageUrl || null,
        audience: form.audience,
        position: widgets.length,
      }),
    });
    setBusy(false);
    if (res.ok) { setForm({ ...empty }); load(); }
    else setError((await res.json()).error ?? 'Could not save');
  }

  async function patch(id: number, body: Record<string, unknown>) {
    await fetch(`/api/admin/widgets/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    load();
  }

  async function move(index: number, dir: -1 | 1) {
    const a = widgets[index];
    const b = widgets[index + dir];
    if (!a || !b) return;
    await patch(a.id, { position: b.position });
    await patch(b.id, { position: a.position });
  }

  async function remove(id: number) {
    if (!confirm('Delete this card?')) return;
    await fetch(`/api/admin/widgets/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-8">
      <form onSubmit={create} className="grid gap-4 border border-stone bg-white p-6 md:grid-cols-2">
        <div className="md:col-span-2"><span className={label}>What&apos;s New card</span></div>
        <label className="block"><span className={label}>Title</span>
          <input className={input} required value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label className="block"><span className={label}>Audience</span>
          <select className={input} value={form.audience}
            onChange={(e) => setForm({ ...form, audience: e.target.value as typeof form.audience })}>
            <option value="all">Everyone</option>
            <option value="qualified">Qualified only</option>
            <option value="student">Students only</option>
          </select></label>
        <label className="block md:col-span-2"><span className={label}>Body</span>
          <textarea className={input} rows={2} value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
        <label className="block"><span className={label}>Link URL (optional)</span>
          <input className={input} value={form.linkUrl}
            onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="https://…" /></label>
        <label className="block"><span className={label}>Image URL (optional)</span>
          <input className={input} value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" /></label>
        {error && <p className="text-sm text-terracotta md:col-span-2">{error}</p>}
        <div className="md:col-span-2">
          <button disabled={busy}
            className="bg-ink px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta disabled:opacity-60">
            {busy ? 'Saving…' : 'Add card'}
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {widgets.length === 0 && <p className="text-sm text-ink2/70">No cards yet.</p>}
        {widgets.map((w, i) => (
          <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 border border-stone bg-white p-4">
            <div className="min-w-0">
              <p className="font-heading text-lg text-ink">{w.title}
                {!w.published && <span className="ml-2 text-xs uppercase tracking-[0.15em] text-ink2/50">hidden</span>}
              </p>
              {w.body && <p className="truncate text-sm text-ink2/70">{w.body}</p>}
              <p className="mt-1 text-xs uppercase tracking-[0.15em] text-ink2/50">Audience: {w.audience}</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="border border-stone px-2 py-1 disabled:opacity-40">↑</button>
              <button onClick={() => move(i, 1)} disabled={i === widgets.length - 1} className="border border-stone px-2 py-1 disabled:opacity-40">↓</button>
              <button onClick={() => patch(w.id, { published: !w.published })} className="border border-stone px-3 py-1">
                {w.published ? 'Hide' : 'Show'}
              </button>
              <button onClick={() => remove(w.id)} className="border border-terracotta px-3 py-1 text-terracotta">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
