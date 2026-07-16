'use client';

import { useEffect, useState } from 'react';

interface Certificate { id: number; pathwayId: number; issuedAt: string; pdfUrl: string | null; pathwayTitle: string; cpdHours: number }
interface ProgressRow { pathwayId: number; title: string; category: string | null; cpdHours: number; percent: number; complete: boolean }

const label = 'text-xs uppercase tracking-[0.15em] text-ink2/70';
const card = 'border border-stone bg-white p-5';

export default function CpdApp() {
  const [certs, setCerts] = useState<Certificate[] | null>(null);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/me/cpd').then(async (r) => {
      if (r.status === 401) { setAuthed(false); return; }
      setAuthed(true);
      const b = await r.json();
      setCerts(b.certificates);
      setProgress(b.progress);
    });
  }, []);

  if (authed === false) {
    return <div className="mx-auto max-w-3xl px-6 py-24 text-center"><h1 className="font-heading text-3xl text-ink">My CPD</h1><p className="mt-3 text-ink2/80">Please <a href="/dashboard" className="text-terracotta underline">sign in</a>.</p></div>;
  }

  const totalHours = (certs ?? []).reduce((s, c) => s + (c.cpdHours || 0), 0);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <p className={label}>Continuing professional development</p>
      <h1 className="mt-1 font-heading text-3xl text-ink md:text-4xl">My CPD</h1>

      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        <div className={card}><p className={label}>Certificates</p><p className="mt-2 font-heading text-3xl text-ink">{certs?.length ?? '—'}</p></div>
        <div className={card}><p className={label}>CPD hours earned</p><p className="mt-2 font-heading text-3xl text-forest">{totalHours}</p></div>
        <div className={card}><p className={label}>Pathways in progress</p><p className="mt-2 font-heading text-3xl text-ink">{progress.filter((p) => p.percent > 0 && !p.complete).length}</p></div>
      </div>

      <section className="mt-10">
        <h2 className="font-heading text-xl text-forest">Certificates earned</h2>
        {certs && certs.length === 0 && <p className="mt-3 text-sm text-ink2/70">No certificates yet — complete a pathway to earn one.</p>}
        <div className="mt-4 space-y-3">
          {(certs ?? []).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border border-stone bg-white p-4">
              <div>
                <p className="font-heading text-lg text-ink">{c.pathwayTitle}</p>
                <p className="text-xs text-ink2/60">{c.cpdHours} CPD hours · issued {c.issuedAt.slice(0, 10)}</p>
              </div>
              {c.pdfUrl && <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer" className="bg-forest px-5 py-2 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta">Download</a>}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-heading text-xl text-forest">Progress history</h2>
        <div className="mt-4 space-y-2">
          {progress.length === 0 && <p className="text-sm text-ink2/70">No pathways yet.</p>}
          {progress.map((p) => (
            <a key={p.pathwayId} href={`/learning/${p.pathwayId}`} className="flex items-center justify-between gap-4 border border-stone bg-white p-3 hover:border-terracotta">
              <div className="min-w-0"><p className="truncate font-medium text-ink">{p.title}</p><p className="text-xs text-ink2/60">{p.category ?? 'Pathway'} · {p.cpdHours} CPD h</p></div>
              <div className="flex w-40 shrink-0 items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone"><div className="h-full rounded-full bg-forest" style={{ width: `${p.percent}%` }} /></div>
                <span className="w-9 text-right text-xs text-ink2/60">{p.percent}%</span>
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
