'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, FilterPills, GhostButton, Label, Loading, Pill } from '@/components/ui';

interface Resource {
  id: number; title: string; type: string; description: string | null;
  contentKind: 'file' | 'link' | 'text'; url: string | null; body: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  handout: 'Handout', protocol: 'Protocol', decision_tree: 'Decision tree',
  recipe: 'Recipe', faq: 'FAQ', email_template: 'Email template',
};

const FILTERS: { id: string; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'handout', label: 'Handouts' },
  { id: 'protocol', label: 'Protocols' },
  { id: 'decision_tree', label: 'Decision trees' },
  { id: 'recipe', label: 'Recipes' },
  { id: 'faq', label: 'FAQs' },
  { id: 'email_template', label: 'Email templates' },
];

function CopyBody({ body }: { body: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4">
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-blush p-4 text-[13px] leading-relaxed text-ink2/90">
        {body}
      </pre>
      <GhostButton
        onClick={async () => {
          try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
        }}
        className="mt-3"
      >
        {copied ? 'Copied ✓' : 'Copy text'}
      </GhostButton>
    </div>
  );
}

function ResourceCard({ r }: { r: Resource }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex flex-col p-6">
      <div>
        <Pill tone="sage">{TYPE_LABELS[r.type] ?? r.type}</Pill>
      </div>
      <p className="mt-3 font-heading text-[19px] leading-snug text-ink">{r.title}</p>
      {r.description && <p className="mt-1.5 text-[14px] leading-relaxed text-ink2/70">{r.description}</p>}

      {r.contentKind === 'text' ? (
        <>
          <GhostButton onClick={() => setOpen((o) => !o)} className="mt-4 self-start">
            {open ? 'Hide' : 'View'}
          </GhostButton>
          {open && r.body && <CopyBody body={r.body} />}
        </>
      ) : (
        r.url && (
          <Button href={r.url} newTab className="mt-4 self-start">
            {r.contentKind === 'file' ? 'Download' : 'Open'}
          </Button>
        )
      )}
    </Card>
  );
}

export default function ToolkitApp() {
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(async (type: string) => {
    const res = await fetch('/api/me/toolkit' + (type ? `?type=${type}` : ''));
    if (res.status === 401) { setAuthed(false); return; }
    setAuthed(true);
    setResources((await res.json()).resources);
  }, []);
  useEffect(() => { load(filter); }, [filter, load]);

  if (authed === false) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="font-heading text-[34px] text-ink">Clinical Toolkit</h1>
        <p className="mt-4 text-ink2/75">
          Available to approved practitioners. Please{' '}
          <a href="/dashboard" className="text-terracotta underline">log in to your dashboard</a> first.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10 lg:py-12">
      <Label>Practitioner tools</Label>
      <h1 className="mt-2 font-heading text-[34px] leading-[1.15] tracking-[-0.01em] text-ink lg:text-[42px]">
        Clinical Toolkit
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink2/75">
        Practical, in-clinic resources — client handouts, protocols, decision trees, recipes,
        FAQs and email templates you can use and adapt.
      </p>

      <FilterPills options={FILTERS} value={filter} onChange={setFilter} className="mt-8" />

      <div className="mt-8">
        {resources === null ? (
          <Loading />
        ) : resources.length === 0 ? (
          <Empty>No resources here yet — check back soon.</Empty>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {resources.map((r) => <ResourceCard key={r.id} r={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}
