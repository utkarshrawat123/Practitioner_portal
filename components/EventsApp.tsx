'use client';

import { useCallback, useEffect, useState } from 'react';

interface EventItem {
  id: number; title: string; description: string | null; startsAt: string; endsAt: string | null;
  location: string | null; eventType: 'online' | 'in_person'; capacity: number | null;
  recordingUrl: string | null; registered: boolean; registrationCount: number; spotsLeft: number | null;
}
type Tab = 'upcoming' | 'live' | 'ondemand' | 'mine';
const TABS: { id: Tab; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' }, { id: 'live', label: 'Live Online' },
  { id: 'ondemand', label: 'On-Demand' }, { id: 'mine', label: 'My Events' },
];
const label = 'text-xs uppercase tracking-[0.15em] text-ink2/70';

function when(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function EventsApp() {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/me/events');
    if (r.status === 401) { setAuthed(false); return; }
    setAuthed(true);
    setEvents((await r.json()).events);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggleReg(e: EventItem) {
    setBusy(e.id);
    await fetch(`/api/me/events/${e.id}/register`, { method: e.registered ? 'DELETE' : 'POST' });
    setBusy(null);
    load();
  }

  if (authed === false) return <div className="mx-auto max-w-3xl px-6 py-24 text-center"><h1 className="font-heading text-3xl text-ink">Events</h1><p className="mt-3 text-ink2/80">Please <a href="/dashboard" className="text-terracotta underline">sign in</a>.</p></div>;

  const now = Date.now();
  const filtered = (events ?? []).filter((e) => {
    const future = new Date(e.startsAt).getTime() >= now;
    if (tab === 'upcoming') return future && !e.recordingUrl;
    if (tab === 'live') return future && e.eventType === 'online';
    if (tab === 'ondemand') return !!e.recordingUrl;
    return e.registered;
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <p className={label}>Events Hub</p>
      <h1 className="mt-1 font-heading text-3xl text-ink md:text-4xl">Events</h1>

      <div className="mt-6 flex gap-6 overflow-x-auto border-b border-stone text-xs uppercase tracking-[0.15em]">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`whitespace-nowrap pb-3 ${tab === t.id ? 'border-b-2 border-terracotta text-terracotta' : 'text-ink2/70'}`}>{t.label}</button>
        ))}
      </div>

      {events === null && <p className="mt-8 text-sm text-ink2/60">Loading…</p>}
      {events && filtered.length === 0 && <p className="mt-8 text-sm text-ink2/70">Nothing here yet.</p>}

      <div className="mt-6 space-y-4">
        {filtered.map((e) => (
          <div key={e.id} className="flex flex-wrap items-start justify-between gap-4 border border-stone bg-white p-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.15em] text-forest">{e.eventType === 'online' ? 'Online' : 'In person'}</span>
                {e.registered && <span className="text-[10px] uppercase tracking-[0.15em] text-terracotta">Registered</span>}
              </div>
              <p className="mt-1 font-heading text-lg text-ink">{e.title}</p>
              <p className="text-xs text-ink2/60">{when(e.startsAt)}{e.location ? ` · ${e.location}` : ''}</p>
              {e.description && <p className="mt-2 max-w-xl text-sm text-ink2/70">{e.description}</p>}
              {e.capacity != null && e.spotsLeft != null && <p className="mt-1 text-xs text-ink2/50">{e.spotsLeft} of {e.capacity} spots left</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              {e.recordingUrl ? (
                <a href={e.recordingUrl} target="_blank" rel="noopener noreferrer" className="bg-forest px-5 py-2 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta">Watch recording</a>
              ) : (
                <button onClick={() => toggleReg(e)} disabled={busy === e.id || (!e.registered && e.spotsLeft === 0)}
                  className={`px-5 py-2 text-xs uppercase tracking-[0.2em] disabled:opacity-50 ${e.registered ? 'border border-forest text-forest hover:border-terracotta hover:text-terracotta' : 'bg-ink text-cream hover:bg-terracotta'}`}>
                  {busy === e.id ? '…' : e.registered ? 'Cancel' : e.spotsLeft === 0 ? 'Full' : 'Register'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
