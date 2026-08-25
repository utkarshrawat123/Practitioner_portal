'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, GhostButton, Label, Loading, inputClass } from '@/components/ui';

interface Row { displayName: string; score: number; isMe: boolean }

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

  if (authed === false) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-heading text-[34px] text-ink">Leaderboard</h1>
        <p className="mt-3 text-ink2/75">Please <a href="/dashboard" className="text-terracotta underline">sign in</a>.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 lg:px-10 lg:py-12">
      <Label>Community</Label>
      <h1 className="mt-2 font-heading text-[34px] leading-[1.15] tracking-[-0.01em] text-ink lg:text-[42px]">
        Engagement Leaderboard
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink2/75">
        Ranked by engagement — learning, events and community participation. It’s opt-in and
        never based on revenue.
      </p>

      <Card className="mt-8 p-6">
        <Label>Your visibility</Label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            className={`${inputClass} mt-0 max-w-xs`}
            placeholder="Display name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          {optedIn ? (
            <GhostButton onClick={() => save(false)}>Remove me</GhostButton>
          ) : (
            <Button onClick={() => save(true)} disabled={busy}>Show me on the leaderboard</Button>
          )}
          {optedIn && <span className="text-[13px] text-olive">You’re listed</span>}
        </div>
      </Card>

      <div className="mt-8">
        {rows === null && <Loading />}
        {rows && rows.length === 0 && <Empty>No one has opted in yet — be the first!</Empty>}
        <ol className="space-y-2.5">
          {(rows ?? []).map((r, i) => (
            <li
              key={i}
              className={`flex items-center justify-between rounded-card p-5 ${
                r.isMe ? 'bg-blush shadow-lift ring-1 ring-terracotta-mid/40' : 'bg-white shadow-card'
              }`}
            >
              <div className="flex items-center gap-4">
                <span className="w-6 font-heading text-[19px] text-ink2/45">{i + 1}</span>
                <span className="text-[15px] font-medium text-ink">
                  {r.displayName}
                  {r.isMe && <span className="ml-2 text-[12px] uppercase tracking-label text-terracotta">you</span>}
                </span>
              </div>
              <span className="font-heading text-[19px] text-terracotta">{r.score}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
