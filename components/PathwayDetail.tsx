'use client';

import { useCallback, useEffect, useState } from 'react';

interface Module {
  id: number; title: string; contentKind: 'lesson' | 'media'; contentId: number;
  position: number; required: boolean; contentTitle: string;
}
interface Progress { percent: number; complete: boolean; required: number; completedModuleIds: number[] }
interface Pathway { id: number; title: string; description: string | null; category: string | null; cpdHours: number }
interface Certificate { pdfUrl: string | null }
interface Data { pathway: Pathway; modules: Module[]; progress: Progress; certificate: Certificate | null }

const label = 'text-xs uppercase tracking-[0.15em] text-ink2/70';

export default function PathwayDetail({ pathwayId }: { pathwayId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'unauth' | 'missing'>('loading');
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/me/pathways/${pathwayId}`);
    if (r.status === 401) { setStatus('unauth'); return; }
    if (r.status === 404) { setStatus('missing'); return; }
    setData(await r.json());
    setStatus('ok');
  }, [pathwayId]);
  useEffect(() => { load(); }, [load]);

  async function complete(moduleId: number) {
    setBusy(moduleId);
    await fetch(`/api/me/pathways/${pathwayId}/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moduleId }),
    });
    setBusy(null);
    load();
  }

  if (status === 'unauth') return <Shell><p className="text-ink2/80">Please <a href="/dashboard" className="text-terracotta underline">sign in</a> to view this pathway.</p></Shell>;
  if (status === 'missing') return <Shell><p className="text-ink2/80">This pathway isn’t available. <a href="/learning" className="text-terracotta underline">Back to Learning</a>.</p></Shell>;
  if (status === 'loading' || !data) return <Shell><p className="text-sm text-ink2/60">Loading…</p></Shell>;

  const done = new Set(data.progress.completedModuleIds);
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <a href="/learning" className="text-xs uppercase tracking-[0.15em] text-ink2/60 hover:text-terracotta">← Learning</a>
      <p className={`${label} mt-4`}>{data.pathway.category ?? 'Pathway'} · {data.pathway.cpdHours} CPD hours</p>
      <h1 className="mt-1 font-heading text-3xl text-ink md:text-4xl">{data.pathway.title}</h1>
      {data.pathway.description && <p className="mt-3 text-ink2/80">{data.pathway.description}</p>}

      <div className="mt-6">
        <div className="h-2 w-full overflow-hidden rounded-full bg-stone">
          <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${data.progress.percent}%` }} />
        </div>
        <p className="mt-2 text-sm text-ink2/70">{data.progress.percent}% complete</p>
      </div>

      {data.progress.complete && (
        <div className="mt-6 border border-forest bg-cream p-5">
          <p className="font-heading text-lg text-forest">Pathway complete 🎉</p>
          <p className="mt-1 text-sm text-ink2/70">Your CPD certificate is ready.</p>
          {data.certificate?.pdfUrl && (
            <a href={data.certificate.pdfUrl} target="_blank" rel="noopener noreferrer"
              className="mt-3 inline-block bg-forest px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta">
              Download certificate
            </a>
          )}
        </div>
      )}

      <ol className="mt-8 space-y-3">
        {data.modules.map((m, i) => {
          const isDone = done.has(m.id);
          const href = m.contentKind === 'lesson' ? '/library' : '/resources';
          return (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 border border-stone bg-white p-4">
              <div className="min-w-0">
                <p className="font-heading text-ink">
                  <span className={`mr-2 ${isDone ? 'text-forest' : 'text-ink2/40'}`}>{isDone ? '✓' : String(i + 1).padStart(2, '0')}</span>
                  {m.title}
                  {!m.required && <span className="ml-2 text-xs text-ink2/50">optional</span>}
                </p>
                <p className="mt-0.5 text-xs text-ink2/60">{m.contentKind === 'lesson' ? 'Lesson' : 'Resource'}: {m.contentTitle}</p>
              </div>
              <div className="flex shrink-0 gap-2 text-xs">
                <a href={href} className="border border-forest px-3 py-1.5 uppercase tracking-[0.15em] text-forest hover:border-terracotta hover:text-terracotta">Open</a>
                {!isDone && (
                  <button onClick={() => complete(m.id)} disabled={busy === m.id}
                    className="bg-ink px-3 py-1.5 uppercase tracking-[0.15em] text-cream hover:bg-terracotta disabled:opacity-60">
                    {busy === m.id ? '…' : 'Mark complete'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-6 py-24 text-center">{children}</div>;
}
