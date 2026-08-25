'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, FilterPills, GhostButton, Label, Loading, Pill } from '@/components/ui';

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

  if (authed === false) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-heading text-[34px] text-ink">Events</h1>
        <p className="mt-3 text-ink2/75">Please <a href="/dashboard" className="text-terracotta underline">sign in</a>.</p>
      </div>
    );
  }

  const now = Date.now();
  const filtered = (events ?? []).filter((e) => {
    const future = new Date(e.startsAt).getTime() >= now;
    if (tab === 'upcoming') return future && !e.recordingUrl;
    if (tab === 'live') return future && e.eventType === 'online';
    if (tab === 'ondemand') return !!e.recordingUrl;
    return e.registered;
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10 lg:py-12">
      <Label>Events Hub</Label>
      <h1 className="mt-2 font-heading text-[34px] leading-[1.15] tracking-[-0.01em] text-ink lg:text-[42px]">
        Events
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink2/75">
        Webinars, breakfast clubs and clinical sessions — register, add to your calendar,
        or catch up on demand.
      </p>

      <FilterPills options={TABS} value={tab} onChange={setTab} className="mt-8" />

      {events === null && <Loading />}
      {events && filtered.length === 0 && (
        <div className="mt-6">
          <Empty>Nothing here yet.</Empty>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {filtered.map((e) => (
          <Card key={e.id} className="flex flex-wrap items-start justify-between gap-4 p-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={e.eventType === 'online' ? 'sage' : 'outline'}>
                  {e.eventType === 'online' ? 'Online' : 'In person'}
                </Pill>
                {e.registered && <Pill>Registered</Pill>}
              </div>
              <p className="mt-3 font-heading text-[19px] leading-snug text-ink">{e.title}</p>
              <p className="mt-1 text-[13px] text-ink2/55">
                {when(e.startsAt)}{e.location ? ` · ${e.location}` : ''}
              </p>
              {e.description && (
                <p className="mt-2.5 max-w-xl text-[14px] leading-relaxed text-ink2/70">{e.description}</p>
              )}
              {e.capacity != null && e.spotsLeft != null && (
                <p className="mt-2 text-[12px] text-ink2/50">{e.spotsLeft} of {e.capacity} spots left</p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {e.recordingUrl ? (
                <Button href={e.recordingUrl} newTab>Watch recording</Button>
              ) : e.registered ? (
                <GhostButton onClick={() => toggleReg(e)}>
                  {busy === e.id ? '…' : 'Cancel'}
                </GhostButton>
              ) : (
                <Button onClick={() => toggleReg(e)} disabled={busy === e.id || e.spotsLeft === 0}>
                  {busy === e.id ? '…' : e.spotsLeft === 0 ? 'Full' : 'Register'}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
