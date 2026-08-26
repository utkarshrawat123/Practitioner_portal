'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';

interface Item {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

/** "3d" / "4h" / "just now" — compact enough for a 320px panel. */
function ago(iso: string): string {
  const then = new Date(iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z')).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/me/notifications');
      if (!r.ok) return;
      const b = (await r.json()) as { items: Item[]; unread: number };
      setItems(b.items ?? []);
      setUnread(b.unread ?? 0);
    } catch {
      /* offline or signed out — leave the last known state */
    }
  }, []);

  // Notifications are not a live conversation, so 60s rather than the chat
  // widget's 2.5s. Opening the panel refetches, so it is never stale in view.
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Click-away closes the panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function markAll() {
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
    await fetch('/api/me/notifications/read', { method: 'POST' });
    load();
  }

  async function openItem(item: Item) {
    if (!item.readAt) {
      await fetch('/api/me/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
    }
    setOpen(false);
    if (item.href) window.location.href = item.href;
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.7} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-terracotta px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/*
        On desktop the panel must clear the 280px sidebar entirely — anchored to the
        bell it overlapped the sidebar and covered the bell that opened it. The bell
        sits at x≈228, so a 64px offset puts the panel at ≈292: just past the sidebar
        edge with a small gap. Below `lg` it drops under the navy top bar instead.
      */}
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-card bg-white shadow-lift lg:left-16 lg:right-auto lg:top-0">
          <div className="flex items-center justify-between gap-3 border-b border-ink/8 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-label text-ink2/55">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-[12px] text-terracotta transition-colors hover:text-terracotta-mid"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-[14px] text-ink2/50">Nothing yet.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-blush/60 ${
                    item.readAt ? '' : 'bg-blush/40'
                  }`}
                >
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.readAt ? 'bg-transparent' : 'bg-terracotta'
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-ink">{item.title}</span>
                    {item.body && (
                      <span className="mt-0.5 block truncate text-[13px] text-ink2/65">{item.body}</span>
                    )}
                    <span className="mt-1 block text-[11px] text-ink2/45">{ago(item.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
