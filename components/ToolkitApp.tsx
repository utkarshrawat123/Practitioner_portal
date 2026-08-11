'use client';

import { useCallback, useEffect, useState } from 'react';

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

const label = 'text-xs uppercase tracking-[0.15em] text-ink2/70';
const card = 'border border-stone bg-white p-6';

function CopyBody({ body }: { body: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3">
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-l-2 border-sage bg-cream p-3 text-sm text-ink2/90">{body}</pre>
      <button
        onClick={async () => {
          try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
        }}
        className="mt-3 bg-ink px-4 py-2 text-xs uppercase tracking-[0.15em] text-cream transition-colors hover:bg-terracotta"
      >
        {copied ? 'Copied ✓' : 'Copy text'}
      </button>
    </div>
  );
}

function ResourceCard({ r }: { r: Resource }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={card}>
      <span className="inline-block bg-sage/40 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-forest">
        {TYPE_LABELS[r.type] ?? r.type}
      </span>
      <p className="mt-3 font-heading text-lg text-ink">{r.title}</p>
      {r.description && <p className="mt-1 text-sm text-ink2/70">{r.description}</p>}

      {r.contentKind === 'text' ? (
        <>
          <button onClick={() => setOpen((o) => !o)}
            className="mt-3 border border-forest px-4 py-1.5 text-xs uppercase tracking-[0.15em] text-forest hover:border-terracotta hover:text-terracotta">
            {open ? 'Hide' : 'View'}
          </button>
          {open && r.body && <CopyBody body={r.body} />}
        </>
      ) : (
        r.url && (
          <a href={r.url} target="_blank" rel="noopener noreferrer"
            className="mt-4 inline-block bg-ink px-5 py-2 text-xs uppercase tracking-[0.15em] text-cream transition-colors hover:bg-terracotta">
            {r.contentKind === 'file' ? 'Download' : 'Open'}
          </a>
        )
      )}
    </div>
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
        <h1 className="font-heading text-3xl text-ink">Clinical Toolkit</h1>
        <p className="mt-4 text-ink2/80">
          Available to approved practitioners. Please{' '}
          <a href="/dashboard" className="text-terracotta underline">log in to your dashboard</a> first.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <p className={label}>Practitioner tools</p>
      <h1 className="mt-1 font-heading text-3xl text-ink md:text-4xl">Clinical Toolkit</h1>
      <p className="mt-3 max-w-2xl text-sm text-ink2/80">
        Practical, in-clinic resources — client handouts, protocols, decision trees, recipes,
        FAQs and email templates you can use and adapt.
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 text-xs uppercase tracking-[0.15em] transition-colors ${
              filter === f.id ? 'bg-ink text-cream' : 'border border-stone text-ink2/70 hover:border-terracotta'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {resources === null ? (
          <p className="text-sm text-ink2/60">Loading…</p>
        ) : resources.length === 0 ? (
          <p className="text-sm text-ink2/70">No resources here yet — check back soon.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {resources.map((r) => <ResourceCard key={r.id} r={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}
