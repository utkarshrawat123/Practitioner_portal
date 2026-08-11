'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { videoEmbed } from '@/lib/embed';

interface Module {
  id: number; title: string; contentKind: 'lesson' | 'media'; contentId: number;
  position: number; required: boolean; contentTitle: string;
  mediaType: string | null; fileKind: 'file' | 'link' | null;
  url: string | null; description: string | null;
}
interface Progress { percent: number; complete: boolean; required: number; completedModuleIds: number[] }
interface Pathway { id: number; title: string; description: string | null; category: string | null; cpdHours: number }
interface Certificate { pdfUrl: string | null }
interface Data { pathway: Pathway; modules: Module[]; progress: Progress; certificate: Certificate | null }

const label = 'text-xs uppercase tracking-[0.15em] text-ink2/70';

export default function PathwayDetail({ pathwayId }: { pathwayId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'unauth' | 'missing'>('loading');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/me/pathways/${pathwayId}`);
    if (r.status === 401) { setStatus('unauth'); return; }
    if (r.status === 404) { setStatus('missing'); return; }
    const d: Data = await r.json();
    setData(d);
    setStatus('ok');
    // First load: open the first not-yet-completed session, else the first one.
    setActiveId((prev) => {
      if (prev !== null && d.modules.some((m) => m.id === prev)) return prev;
      const done = new Set(d.progress.completedModuleIds);
      return (d.modules.find((m) => !done.has(m.id)) ?? d.modules[0])?.id ?? null;
    });
  }, [pathwayId]);
  useEffect(() => { load(); }, [load]);

  const done = useMemo(
    () => new Set(data?.progress.completedModuleIds ?? []),
    [data]
  );
  const active = data?.modules.find((m) => m.id === activeId) ?? null;
  const activeIndex = data?.modules.findIndex((m) => m.id === activeId) ?? -1;

  async function completeAndContinue(moduleId: number) {
    setBusy(true);
    await fetch(`/api/me/pathways/${pathwayId}/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moduleId }),
    });
    // Advance to the next session before refreshing the data.
    if (data) {
      const idx = data.modules.findIndex((m) => m.id === moduleId);
      const next = data.modules[idx + 1];
      if (next) setActiveId(next.id);
    }
    setBusy(false);
    load();
  }

  if (status === 'unauth') return <Shell><p className="text-ink2/80">Please <a href="/dashboard" className="text-terracotta underline">sign in</a> to view this pathway.</p></Shell>;
  if (status === 'missing') return <Shell><p className="text-ink2/80">This pathway isn’t available. <a href="/learning" className="text-terracotta underline">Back to Learning</a>.</p></Shell>;
  if (status === 'loading' || !data) return <Shell><p className="text-sm text-ink2/60">Loading…</p></Shell>;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <a href="/learning" className="text-xs uppercase tracking-[0.15em] text-ink2/60 hover:text-terracotta">← Learning</a>
      <p className={`${label} mt-4`}>{data.pathway.category ?? 'Pathway'} · {data.pathway.cpdHours} CPD hours</p>
      <h1 className="mt-1 font-heading text-3xl text-ink md:text-4xl">{data.pathway.title}</h1>
      {data.pathway.description && <p className="mt-3 max-w-3xl text-ink2/80">{data.pathway.description}</p>}

      <div className="mt-6 max-w-3xl">
        <div className="h-2 w-full overflow-hidden rounded-full bg-stone">
          <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${data.progress.percent}%` }} />
        </div>
        <p className="mt-2 text-sm text-ink2/70">{data.progress.percent}% complete · {done.size} of {data.modules.length} sessions</p>
      </div>

      {data.progress.complete && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-forest bg-cream p-5">
          <div>
            <p className="font-heading text-lg text-forest">Pathway complete 🎉</p>
            <p className="mt-1 text-sm text-ink2/70">Your CPD certificate is ready to download.</p>
          </div>
          {data.certificate?.pdfUrl && (
            <a href={data.certificate.pdfUrl} target="_blank" rel="noopener noreferrer"
              className="inline-block bg-forest px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta">
              Download certificate
            </a>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Session list */}
        <aside className="order-2 lg:order-1">
          <p className={label}>Sessions</p>
          <ol className="mt-3 space-y-2">
            {data.modules.map((m, i) => {
              const isDone = done.has(m.id);
              const isActive = m.id === activeId;
              return (
                <li key={m.id}>
                  <button
                    onClick={() => setActiveId(m.id)}
                    className={`flex w-full items-start gap-3 border p-3 text-left transition-colors ${
                      isActive ? 'border-terracotta bg-white' : 'border-stone bg-white hover:border-terracotta/60'
                    }`}
                  >
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                      isDone ? 'bg-forest text-cream' : isActive ? 'bg-terracotta text-cream' : 'bg-stone text-ink2'
                    }`}>
                      {isDone ? '✓' : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{m.title}</span>
                      <span className="text-xs text-ink2/60">
                        {sessionKindLabel(m)}{!m.required && ' · optional'}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* Active session */}
        <section className="order-1 lg:order-2">
          {active ? (
            <div className="border border-stone bg-white">
              <SessionPlayer module={active} />
              <div className="p-6">
                <p className={label}>Session {activeIndex + 1} of {data.modules.length}</p>
                <h2 className="mt-1 font-heading text-2xl text-ink">{active.title}</h2>
                {active.description && <p className="mt-2 text-sm text-ink2/80">{active.description}</p>}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {done.has(active.id) ? (
                    <>
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-forest">✓ Completed</span>
                      {data.modules[activeIndex + 1] && (
                        <button onClick={() => setActiveId(data.modules[activeIndex + 1].id)}
                          className="border border-forest px-5 py-2 text-xs uppercase tracking-[0.2em] text-forest hover:border-terracotta hover:text-terracotta">
                          Next session →
                        </button>
                      )}
                    </>
                  ) : (
                    <button onClick={() => completeAndContinue(active.id)} disabled={busy}
                      className="bg-forest px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta disabled:opacity-60">
                      {busy ? 'Saving…' : data.modules[activeIndex + 1] ? 'Mark complete & continue' : 'Mark complete'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-stone bg-white p-8 text-sm text-ink2/70">This pathway has no sessions yet.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function sessionKindLabel(m: Module): string {
  if (m.contentKind === 'lesson') return 'Lesson';
  if (m.mediaType === 'video') return 'Video';
  if (m.mediaType) return m.mediaType.charAt(0).toUpperCase() + m.mediaType.slice(1);
  return 'Resource';
}

/** Renders the session content: inline video/embed, or a link-out for other resources. */
function SessionPlayer({ module: m }: { module: Module }) {
  if (m.contentKind === 'media' && m.url && m.mediaType === 'video') {
    const embed = videoEmbed(m.url, m.fileKind ?? undefined);
    if (embed.kind === 'iframe') {
      return (
        <div className="relative w-full bg-ink" style={{ paddingTop: '56.25%' }}>
          <iframe
            src={embed.src}
            title={m.title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
    if (embed.kind === 'video') {
      // eslint-disable-next-line jsx-a11y/media-has-caption
      return <video src={embed.src} controls className="aspect-video w-full bg-ink" />;
    }
  }

  // Non-video resources (documents, slides, images) or lessons: link out.
  const href = m.contentKind === 'lesson' ? '/library' : m.url ?? '/resources';
  return (
    <div className="flex items-center justify-center border-b border-stone bg-cream p-10">
      <a href={href} target={m.url ? '_blank' : undefined} rel="noopener noreferrer"
        className="bg-ink px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta">
        Open {m.contentKind === 'lesson' ? 'lesson' : m.mediaType ?? 'resource'}
      </a>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-6 py-24 text-center">{children}</div>;
}
