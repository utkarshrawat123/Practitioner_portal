'use client';

import { useEffect, useState } from 'react';
import { Card, Empty, Label, Loading, Pill, Progress } from '@/components/ui';

const CATEGORIES = [
  'Women’s Health', 'Hormone Health', 'Gut Health', 'Immune Health',
  'Children’s Health', 'Joint Health', 'Heart Health', 'Brain Health',
];

interface ProgressData { percent: number; complete: boolean; required: number }
interface Pathway {
  id: number; title: string; description: string | null; category: string | null;
  cpdHours: number; progress: ProgressData;
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
        <h1 className="font-heading text-[34px] text-ink">Learning Pathways</h1>
        <p className="mt-3 text-ink2/75">Please <a href="/dashboard" className="text-terracotta underline">sign in</a> to view your pathways.</p>
      </div>
    );
  }

  const byCategory = (cat: string) => (pathways ?? []).filter((p) => (p.category ?? 'Other') === cat);
  const uncategorised = (pathways ?? []).filter((p) => !p.category || !CATEGORIES.includes(p.category));

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10 lg:py-12">
      <Label>Learning</Label>
      <h1 className="mt-2 font-heading text-[34px] leading-[1.15] tracking-[-0.01em] text-ink lg:text-[42px]">
        Learning Pathways
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink2/75">
        Structured, multi-module pathways that build toward a downloadable CPD certificate.
        Pick a focus area to begin.
      </p>

      {pathways === null && <Loading />}
      {pathways && pathways.length === 0 && (
        <div className="mt-10">
          <Empty>No pathways published yet — check back soon.</Empty>
        </div>
      )}

      {pathways && pathways.length > 0 && (
        <div className="mt-10 space-y-11">
          {CATEGORIES.map((cat) => {
            const items = byCategory(cat);
            if (items.length === 0) return null;
            return (
              <section key={cat}>
                <h2 className="font-heading text-[22px] leading-tight text-ink lg:text-[25px]">{cat}</h2>
                <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((p) => <PathwayCard key={p.id} p={p} />)}
                </div>
              </section>
            );
          })}
          {uncategorised.length > 0 && (
            <section>
              <h2 className="font-heading text-[22px] leading-tight text-ink lg:text-[25px]">More</h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {uncategorised.map((p) => <PathwayCard key={p.id} p={p} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function PathwayCard({ p }: { p: Pathway }) {
  return (
    <Card href={`/learning/${p.id}`} className="p-6">
      <div className="flex items-center justify-between gap-3">
        <Label>{p.cpdHours} CPD hours</Label>
        {p.progress.complete && <Pill tone="sage">Complete</Pill>}
      </div>
      <p className="mt-3 font-heading text-[19px] leading-snug text-ink">{p.title}</p>
      {p.description && <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-ink2/70">{p.description}</p>}
      <Progress value={p.progress.percent} className="mt-4" />
      <p className="mt-2 text-[12px] text-ink2/55">{p.progress.percent}% complete</p>
    </Card>
  );
}
