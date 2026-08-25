'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { videoEmbed } from '@/lib/embed';
import { Button, GhostButton, Label, Progress } from '@/components/ui';

interface Module {
  id: number; title: string; contentKind: 'lesson' | 'media'; contentId: number;
  position: number; required: boolean; contentTitle: string;
  mediaType: string | null; fileKind: 'file' | 'link' | null;
  url: string | null; description: string | null;
}
interface ProgressData { percent: number; complete: boolean; required: number; completedModuleIds: number[] }
interface Pathway { id: number; title: string; description: string | null; category: string | null; cpdHours: number }
interface Certificate { pdfUrl: string | null }
interface Data { pathway: Pathway; modules: Module[]; progress: ProgressData; certificate: Certificate | null }

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
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10 lg:py-12">
      <a
        href="/learning"
        className="group inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-label text-ink2/55 transition-colors hover:text-terracotta"
      >
        <span className="transition-transform group-hover:-translate-x-0.5">←</span> Learning
      </a>

      <header className="mt-5">
        <Label>{data.pathway.category ?? 'Pathway'} · {data.pathway.cpdHours} CPD hours</Label>
        <h1 className="mt-2 font-heading text-[34px] leading-[1.15] tracking-[-0.01em] text-ink lg:text-[42px]">
          {data.pathway.title}
        </h1>
        {data.pathway.description && (
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink2/75">{data.pathway.description}</p>
        )}
      </header>

      <div className="mt-7 max-w-2xl">
        <Progress value={data.progress.percent} />
        <p className="mt-2.5 text-[13px] text-ink2/60">
          {data.progress.percent}% complete · {done.size} of {data.modules.length} sessions
        </p>
      </div>

      {data.progress.complete && (
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-card bg-blush p-6 shadow-card">
          <div>
            <p className="font-heading text-[20px] text-ink">Pathway complete</p>
            <p className="mt-1 text-[14px] text-ink2/70">Your CPD certificate is ready to download.</p>
          </div>
          {data.certificate?.pdfUrl && (
            <Button href={data.certificate.pdfUrl} newTab>Download certificate</Button>
          )}
        </div>
      )}

      <div className="mt-9 grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Session list */}
        <aside className="order-2 lg:order-1">
          <Label className="px-1">Sessions</Label>
          <ol className="mt-3 space-y-2.5">
            {data.modules.map((m, i) => {
              const isDone = done.has(m.id);
              const isActive = m.id === activeId;
              return (
                <li key={m.id}>
                  <button
                    onClick={() => setActiveId(m.id)}
                    aria-current={isActive ? 'step' : undefined}
                    className={`flex w-full items-start gap-3 rounded-card p-4 text-left transition-all ${
                      isActive
                        ? 'bg-white shadow-lift ring-1 ring-terracotta-mid/45'
                        : 'bg-white/70 shadow-card hover:bg-white hover:shadow-lift'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                        isDone
                          ? 'bg-olive text-white'
                          : isActive
                            ? 'bg-terracotta text-white'
                            : 'bg-stone text-ink2/70'
                      }`}
                    >
                      {isDone ? '✓' : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium text-ink">{m.title}</span>
                      <span className="mt-0.5 block text-[12px] text-ink2/55">
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
            <div className="overflow-hidden rounded-card bg-white shadow-card">
              <SessionPlayer module={active} />
              <div className="p-7">
                <Label>Session {activeIndex + 1} of {data.modules.length}</Label>
                <h2 className="mt-2 font-heading text-[25px] leading-tight text-ink">{active.title}</h2>
                {active.description && (
                  <p className="mt-2.5 text-[15px] leading-relaxed text-ink2/75">{active.description}</p>
                )}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {done.has(active.id) ? (
                    <>
                      <span className="inline-flex items-center gap-2 rounded-pill bg-sage-pale px-4 py-2 text-[13px] font-medium text-ink">
                        <span className="text-olive">✓</span> Completed
                      </span>
                      {data.modules[activeIndex + 1] && (
                        <GhostButton onClick={() => setActiveId(data.modules[activeIndex + 1].id)}>
                          Next session →
                        </GhostButton>
                      )}
                    </>
                  ) : (
                    <Button onClick={() => completeAndContinue(active.id)} disabled={busy}>
                      {busy ? 'Saving…' : data.modules[activeIndex + 1] ? 'Mark complete & continue' : 'Mark complete'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-card bg-white p-10 text-center text-[15px] text-ink2/60 shadow-card">
              This pathway has no sessions yet.
            </div>
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
  const what = m.contentKind === 'lesson' ? 'lesson' : m.mediaType ?? 'resource';
  return (
    <div className="flex flex-col items-center justify-center gap-3 bg-blush px-6 py-12">
      <Label>{what}</Label>
      <Button href={href} newTab={!!m.url}>Open {what}</Button>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-6 py-24 text-center">{children}</div>;
}
