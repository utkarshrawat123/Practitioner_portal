'use client';

import { useCallback, useEffect, useState } from 'react';
import MediaCard from '@/components/MediaCard';
import { Button, Empty, FilterPills, Label } from '@/components/ui';
import SaveButton from '@/components/SaveButton';
import { useSavedRefs } from '@/lib/useSavedRefs';

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
  const { isSaved, setSaved } = useSavedRefs();

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
        <h1 className="font-heading text-[34px] text-ink">Please sign in</h1>
        <p className="mt-3 text-[15px] text-ink2/75">Resources are available to approved practitioners.</p>
        <Button href="/dashboard" className="mt-6">Go to sign in</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10 lg:py-12">
      <Label>Library</Label>
      <h1 className="mt-2 font-heading text-[34px] leading-[1.15] tracking-[-0.01em] text-ink lg:text-[42px]">
        Resources
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink2/75">
        Webinars, guides, slide decks and reference material you can use in clinic.
      </p>

      <FilterPills options={FILTERS} value={filter} onChange={setFilter} className="mt-8" />

      {rows.length === 0 ? (
        <div className="mt-8">
          <Empty>No resources here yet.</Empty>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((m) => (
            <MediaCard key={m.id} item={m}>
              <div className="mt-3">
                <SaveButton
                  itemType="media"
                  itemId={m.id}
                  saved={isSaved('media', m.id)}
                  onToggle={(v) => setSaved('media', m.id, v)}
                />
              </div>
            </MediaCard>
          ))}
        </div>
      )}
    </div>
  );
}
