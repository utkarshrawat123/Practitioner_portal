'use client';

import { useCallback, useEffect, useState } from 'react';

interface Row { displayName: string; score: number; isMe: boolean }
const label = 'text-xs uppercase tracking-[0.15em] text-ink2/70';

export default function LeaderboardApp() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [optedIn, setOptedIn] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/me/leaderboard');
    if (r.status === 401) { setAuthed(false); return; }
    setAuthed(true);
    const b = await r.json();
    setRows(b.leaderboard);
    setOptedIn(b.optedIn);
    setDisplayName(b.displayName ?? '');
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(next: boolean) {
    setBusy(true);
    await fetch('/api/me/leaderboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optedIn: next, displayName: displayName || null }) });
    setBusy(false);
    load();
  }

  if (authed === false) return <div className="mx-auto max-w-3xl px-6 py-24 text-center"><h1 className="font-heading text-3xl text-ink">Leaderboard</h1><p className="mt-3 text-ink2/80">Please <a href="/dashboard" className="text-terracotta underline">sign in</a>.</p></div>;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <p className={label}>Community</p>
      <h1 className="mt-1 font-heading text-3xl text-ink md:text-4xl">Engagement Leaderboard</h1>
      <p className="mt-3 text-ink2/80">Ranked by engagement — learning, events and community participation. It’s opt-in and never based on revenue.</p>

      <div className="mt-6 border border-stone bg-white p-5">
        <p className={label}>Your visibility</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input className="border border-stone px-3 py-2 text-sm focus:border-terracotta focus:outline-none" placeholder="Display name (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <button onClick={() => save(!optedIn)} disabled={busy} className={`px-5 py-2 text-xs uppercase tracking-[0.2em] disabled:opacity-60 ${optedIn ? 'border border-forest text-forest hover:border-terracotta hover:text-terracotta' : 'bg-ink text-cream hover:bg-terracotta'}`}>
            {optedIn ? 'Remove me' : 'Show me on the leaderboard'}
          </button>
          {optedIn && <span className="text-xs text-forest">You’re listed</span>}
        </div>
      </div>

      <div className="mt-8">
        {rows === null && <p className="text-sm text-ink2/60">Loading…</p>}
        {rows && rows.length === 0 && <p className="text-sm text-ink2/70">No one has opted in yet — be the first!</p>}
        <ol className="space-y-2">
          {(rows ?? []).map((r, i) => (
            <li key={i} className={`flex items-center justify-between border p-4 ${r.isMe ? 'border-terracotta bg-cream' : 'border-stone bg-white'}`}>
              <div className="flex items-center gap-4">
                <span className="w-6 font-heading text-lg text-ink2/60">{i + 1}</span>
                <span className="font-medium text-ink">{r.displayName}{r.isMe && <span className="ml-2 text-xs text-terracotta">you</span>}</span>
              </div>
              <span className="font-heading text-lg text-forest">{r.score}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
