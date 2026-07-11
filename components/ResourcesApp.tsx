'use client';

import { useCallback, useEffect, useState } from 'react';
import MediaCard from '@/components/MediaCard';

interface MediaRow {
  id: number; title: string; type: 'video' | 'document' | 'slides' | 'image';
  description: string | null; url: string; thumbnailUrl: string | null;
}

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'video', label: 'Video' },
  { id: 'document', label: 'Documents' },
  { id: 'slides', label: 'Slides' },
  { id: 'image', label: 'Images' },
];

export default function ResourcesApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [filter, setFilter] = useState('');

  const load = useCallback(async (type: string) => {
    const res = await fetch('/api/resources' + (type ? `?type=${type}` : ''));
    if (res.status === 401) { setAuthed(false); return; }
    setAuthed(true);
    setRows((await res.json()).media);
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  if (authed === false) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="font-heading text-3xl text-ink">Please sign in</h1>
        <p className="mt-3 text-sm text-ink2/80">Resources are available to approved practitioners.</p>
        <a href="/dashboard" className="mt-6 inline-block bg-ink px-6 py-3 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta">Go to sign in</a>
      </div>
    );
  }

  return (
    <div className="w-full px-8 py-12 lg:px-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-heading text-3xl text-ink md:text-4xl">Resources</h1>
        <a href="/dashboard" className="text-xs uppercase tracking-[0.15em] text-terracotta underline">Back to dashboard</a>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-4 py-2 text-xs uppercase tracking-[0.15em] ${filter === f.id ? 'bg-ink text-cream' : 'border border-stone text-ink2/70 hover:border-terracotta'}`}>
            {f.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-ink2/70">No resources here yet.</p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((m) => <MediaCard key={m.id} item={m} />)}
        </div>
      )}
    </div>
  );
}
