'use client';

import { useCallback, useEffect, useState } from 'react';

interface EventRow {
  id: number; title: string; startsAt: string; eventType: 'online' | 'in_person';
  location: string | null; capacity: number | null; recordingUrl: string | null; published: boolean;
}
const label = 'text-[11px] font-medium uppercase tracking-label text-ink2/55';
const input = 'mt-1 w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[15px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50';
const empty = { title: '', description: '', startsAt: '', endsAt: '', location: '', eventType: 'online' as const, capacity: '', audience: 'all' as const, recordingUrl: '', published: false };

export default function AdminEvents() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/events');
    if (r.ok) setEvents((await r.json()).events);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const body: Record<string, unknown> = {
      title: form.title, description: form.description || null,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      location: form.location || null, eventType: form.eventType,
      capacity: form.capacity ? Number(form.capacity) : null, audience: form.audience,
      recordingUrl: form.recordingUrl || null, published: form.published,
    };
    const res = await fetch('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) { setForm({ ...empty }); load(); }
    else setError((await res.json()).error ?? 'Could not save');
  }
  async function patch(id: number, b: Record<string, unknown>) {
    await fetch(`/api/admin/events/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    load();
  }
  async function remove(id: number) {
    if (!confirm('Delete this event?')) return;
    await fetch(`/api/admin/events/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-8">
      <form onSubmit={create} className="grid gap-4 rounded-card bg-white shadow-card p-6 md:grid-cols-2">
        <div className="md:col-span-2"><span className={label}>New event</span></div>
        <label className="block md:col-span-2"><span className={label}>Title</span><input className={input} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label className="block"><span className={label}>Starts at</span><input type="datetime-local" className={input} required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label>
        <label className="block"><span className={label}>Ends at (optional)</span><input type="datetime-local" className={input} value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label>
        <label className="block"><span className={label}>Type</span>
          <select className={input} value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value as typeof form.eventType })}><option value="online">Online</option><option value="in_person">In person</option></select></label>
        <label className="block"><span className={label}>Audience</span>
          <select className={input} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as typeof form.audience })}><option value="all">Everyone</option><option value="qualified">Qualified</option><option value="student">Students</option></select></label>
        <label className="block"><span className={label}>Location / join link</span><input className={input} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="https://… or venue" /></label>
        <label className="block"><span className={label}>Capacity (optional)</span><input type="number" min={1} className={input} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label>
        <label className="block md:col-span-2"><span className={label}>Recording URL (on-demand, optional)</span><input className={input} value={form.recordingUrl} onChange={(e) => setForm({ ...form, recordingUrl: e.target.value })} placeholder="https://…" /></label>
        <label className="block md:col-span-2"><span className={label}>Description</span><textarea className={input} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> Publish immediately</label>
        {error && <p className="text-sm text-terracotta md:col-span-2">{error}</p>}
        <div className="md:col-span-2"><button className="inline-flex items-center justify-center rounded-pill bg-navy px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-navy-mid disabled:opacity-50 hover:bg-terracotta">Create event</button></div>
      </form>

      <div className="space-y-2">
        {events.length === 0 && <p className="text-sm text-ink2/70">No events yet.</p>}
        {events.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-white shadow-card p-4">
            <div className="min-w-0">
              <p className="font-heading text-ink">{e.title} {!e.published && <span className="text-xs text-ink2/50">(draft)</span>} {e.recordingUrl && <span className="text-xs text-terracotta">· on-demand</span>}</p>
              <p className="text-xs text-ink2/60">{new Date(e.startsAt).toLocaleString('en-GB')} · {e.eventType}{e.capacity ? ` · cap ${e.capacity}` : ''}</p>
            </div>
            <div className="flex shrink-0 gap-2 text-xs">
              <button onClick={() => patch(e.id, { published: !e.published })} className="rounded-pill bg-white px-3 py-1 text-[13px] text-ink2 shadow-card transition-colors hover:text-ink">{e.published ? 'Unpublish' : 'Publish'}</button>
              <button onClick={() => remove(e.id)} className="border border-terracotta px-3 py-1 text-terracotta">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
