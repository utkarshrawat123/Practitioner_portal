'use client';

import { useEffect, useState } from 'react';

const CATEGORIES = [
  'Women’s Health', 'Hormone Health', 'Gut Health', 'Immune Health',
  'Children’s Health', 'Joint Health', 'Heart Health', 'Brain Health',
];

interface Progress { percent: number; complete: boolean; required: number }
interface Pathway {
  id: number; title: string; description: string | null; category: string | null;
  cpdHours: number; progress: Progress;
}

const label = 'text-xs uppercase tracking-[0.15em] text-ink2/70';

function Bar({ percent }: { percent: number }) {
  return (
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone">
      <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${percent}%` }} />
    </div>
  );
}

export default function LearningCatalogue() {
  const [pathways, setPathways] = useState<Pathway[] | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/me/pathways').then(async (r) => {
      if (r.status === 401) { setAuthed(false); return; }
      setAuthed(true);
      setPathways((await r.json()).pathways);
    });
  }, []);

  if (authed === false) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-heading text-3xl text-ink">Learning Pathways</h1>
        <p className="mt-3 text-ink2/80">Please <a href="/dashboard" className="text-terracotta underline">sign in</a> to view your pathways.</p>
      </div>
    );
  }

  const byCategory = (cat: string) => (pathways ?? []).filter((p) => (p.category ?? 'Other') === cat);
  const uncategorised = (pathways ?? []).filter((p) => !p.category || !CATEGORIES.includes(p.category));

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <p className={label}>Learning</p>
      <h1 className="mt-1 font-heading text-3xl text-ink md:text-4xl">Learning Pathways</h1>
      <p className="mt-3 max-w-2xl text-ink2/80">Structured, multi-module pathways that build toward a downloadable CPD certificate. Pick a focus area to begin.</p>

      {pathways === null && <p className="mt-10 text-sm text-ink2/60">Loading…</p>}
      {pathways && pathways.length === 0 && (
        <div className="mt-10 border-l-2 border-terracotta bg-cream px-4 py-3 text-sm text-ink2/80">No pathways published yet — check back soon.</div>
      )}

      {pathways && pathways.length > 0 && (
        <div className="mt-10 space-y-12">
          {CATEGORIES.map((cat) => {
            const items = byCategory(cat);
            if (items.length === 0) return null;
            return (
              <section key={cat}>
                <h2 className="font-heading text-xl text-forest">{cat}</h2>
                <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((p) => <Card key={p.id} p={p} />)}
                </div>
              </section>
            );
          })}
          {uncategorised.length > 0 && (
            <section>
              <h2 className="font-heading text-xl text-forest">More</h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {uncategorised.map((p) => <Card key={p.id} p={p} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ p }: { p: Pathway }) {
  return (
    <a href={`/learning/${p.id}`} className="block border border-stone bg-white p-5 transition-colors hover:border-terracotta">
      <div className="flex items-center justify-between">
        <p className={label}>{p.cpdHours} CPD hours</p>
        {p.progress.complete && <span className="text-[10px] uppercase tracking-[0.15em] text-forest">✓ Complete</span>}
      </div>
      <p className="mt-2 font-heading text-lg text-ink">{p.title}</p>
      {p.description && <p className="mt-1 line-clamp-2 text-sm text-ink2/70">{p.description}</p>}
      <Bar percent={p.progress.percent} />
      <p className="mt-1.5 text-xs text-ink2/60">{p.progress.percent}% complete</p>
    </a>
  );
}
