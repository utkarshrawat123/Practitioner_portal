'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Empty, Label, Progress } from '@/components/ui';

interface Certificate { id: number; pathwayId: number; issuedAt: string; pdfUrl: string | null; pathwayTitle: string; cpdHours: number }
interface ProgressRow { pathwayId: number; title: string; category: string | null; cpdHours: number; percent: number; complete: boolean }

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
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-heading text-[34px] text-ink">My CPD</h1>
        <p className="mt-3 text-ink2/75">Please <a href="/dashboard" className="text-terracotta underline">sign in</a>.</p>
      </div>
    );
  }

  const totalHours = (certs ?? []).reduce((s, c) => s + (c.cpdHours || 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10 lg:py-12">
      <Label>Continuing professional development</Label>
      <h1 className="mt-2 font-heading text-[34px] leading-[1.15] tracking-[-0.01em] text-ink lg:text-[42px]">
        My CPD
      </h1>

      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        <Card className="p-6">
          <Label>Certificates</Label>
          <p className="mt-2 font-heading text-[32px] leading-none text-ink">{certs?.length ?? '—'}</p>
        </Card>
        <Card tone="blush" className="p-6">
          <Label>CPD hours earned</Label>
          <p className="mt-2 font-heading text-[32px] leading-none text-terracotta">{totalHours}</p>
        </Card>
        <Card className="p-6">
          <Label>Pathways in progress</Label>
          <p className="mt-2 font-heading text-[32px] leading-none text-ink">
            {progress.filter((p) => p.percent > 0 && !p.complete).length}
          </p>
        </Card>
      </div>

      <section className="mt-11">
        <h2 className="font-heading text-[22px] leading-tight text-ink lg:text-[25px]">Certificates earned</h2>
        {certs && certs.length === 0 && (
          <div className="mt-4">
            <Empty>No certificates yet — complete a pathway to earn one.</Empty>
          </div>
        )}
        <div className="mt-4 space-y-3">
          {(certs ?? []).map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="font-heading text-[19px] text-ink">{c.pathwayTitle}</p>
                <p className="mt-0.5 text-[13px] text-ink2/55">
                  {c.cpdHours} CPD hours · issued {c.issuedAt.slice(0, 10)}
                </p>
              </div>
              {c.pdfUrl && <Button href={c.pdfUrl} newTab>Download</Button>}
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-11">
        <h2 className="font-heading text-[22px] leading-tight text-ink lg:text-[25px]">Progress history</h2>
        <div className="mt-4 space-y-2.5">
          {progress.length === 0 && <Empty>No pathways yet.</Empty>}
          {progress.map((p) => (
            <Card key={p.pathwayId} href={`/learning/${p.pathwayId}`} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium text-ink">{p.title}</p>
                <p className="mt-0.5 text-[12px] text-ink2/55">{p.category ?? 'Pathway'} · {p.cpdHours} CPD h</p>
              </div>
              <div className="flex w-40 shrink-0 items-center gap-3">
                <Progress value={p.percent} className="flex-1" />
                <span className="w-9 text-right text-[12px] text-ink2/55">{p.percent}%</span>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
