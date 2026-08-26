'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SavedItem, SavedItemType } from '@/lib/db';
import { Button, Card, Empty, Label, Loading, Pill } from '@/components/ui';

const SECTIONS: { type: SavedItemType; title: string; browseHref: string; browseLabel: string }[] = [
  { type: 'toolkit', title: 'Clinical Toolkit', browseHref: '/toolkit', browseLabel: 'Browse the toolkit' },
  { type: 'media', title: 'Resources', browseHref: '/resources', browseLabel: 'Browse resources' },
  { type: 'lesson', title: 'Lessons', browseHref: '/library', browseLabel: 'Browse lessons' },
];

export default function MyClinicApp() {
  const [items, setItems] = useState<SavedItem[] | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/me/saved');
    if (r.status === 401) { setAuthed(false); return; }
    setAuthed(true);
    setItems((await r.json()).items);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(item: SavedItem) {
    setItems((prev) => (prev ?? []).filter((i) => !(i.itemType === item.itemType && i.itemId === item.itemId)));
    await fetch('/api/me/saved', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemType: item.itemType, itemId: item.itemId }),
    });
    load();
  }

  if (authed === false) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-heading text-[34px] text-ink">My Clinic</h1>
        <p className="mt-3 text-ink2/75">Please <a href="/dashboard" className="text-terracotta underline">sign in</a>.</p>
      </div>
    );
  }

  const total = items?.length ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10 lg:py-12">
      <Label>My Clinic</Label>
      <h1 className="mt-2 font-heading text-[34px] leading-[1.15] tracking-[-0.01em] text-ink lg:text-[42px]">
        Saved for clinic
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink2/75">
        Everything you’ve saved, in one place — ready for your next consultation.
      </p>

      {items === null && <Loading />}

      {items !== null && total === 0 && (
        <div className="mt-8 space-y-4">
          <Empty>
            Nothing saved yet. Look for the <strong>Save</strong> button on toolkit items,
            resources and lessons.
          </Empty>
          <div className="flex flex-wrap justify-center gap-3">
            {SECTIONS.map((s) => (
              <Button key={s.type} href={s.browseHref}>{s.browseLabel}</Button>
            ))}
          </div>
        </div>
      )}

      {items !== null && total > 0 && (
        <div className="mt-10 space-y-11">
          {SECTIONS.map((section) => {
            const rows = items.filter((i) => i.itemType === section.type);
            if (rows.length === 0) return null;
            return (
              <section key={section.type}>
                <h2 className="font-heading text-[22px] leading-tight text-ink lg:text-[25px]">
                  {section.title}
                </h2>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  {rows.map((item) => (
                    <Card key={`${item.itemType}:${item.itemId}`} className="flex flex-col p-6">
                      {item.meta && <div><Pill tone="sage">{item.meta}</Pill></div>}
                      <p className="mt-3 font-heading text-[19px] leading-snug text-ink">{item.title}</p>
                      {item.description && (
                        <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-ink2/70">
                          {item.description}
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Button href={item.href} newTab={item.href.startsWith('http')}>Open</Button>
                        <button
                          type="button"
                          onClick={() => remove(item)}
                          className="rounded-pill px-3 py-1.5 text-[13px] text-ink2/60 transition-colors hover:text-terracotta"
                        >
                          Remove
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
