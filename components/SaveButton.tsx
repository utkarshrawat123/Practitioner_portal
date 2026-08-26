'use client';

import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import type { SavedItemType } from '@/lib/db';

/**
 * Optimistic save toggle. Reverts on a failed request — the icon must never
 * claim something is saved when the server disagreed.
 */
export default function SaveButton({
  itemType,
  itemId,
  saved,
  onToggle,
}: {
  itemType: SavedItemType;
  itemId: number;
  saved: boolean;
  onToggle: (nowSaved: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !saved;
    setBusy(true);
    onToggle(next); // optimistic
    try {
      const res = await fetch('/api/me/saved', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType, itemId }),
      });
      if (!res.ok) onToggle(!next); // revert
    } catch {
      onToggle(!next); // revert
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      title={saved ? 'Saved to My Clinic' : 'Save to My Clinic'}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] transition-colors disabled:opacity-50 ${
        saved ? 'bg-terracotta-mid text-white' : 'bg-blush text-ink2 hover:text-ink'
      }`}
    >
      <Bookmark className="h-3.5 w-3.5" strokeWidth={1.8} fill={saved ? 'currentColor' : 'none'} />
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}
