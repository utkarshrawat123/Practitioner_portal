'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SavedItemType } from '@/lib/db';

const key = (t: SavedItemType, id: number) => `${t}:${id}`;

/**
 * Fetches the practitioner's saved refs once, and tracks them locally as the
 * user toggles. Lives in its own hook so all three list pages share one
 * request shape and one source of truth.
 */
export function useSavedRefs() {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/me/saved')
      .then((r) => (r.ok ? r.json() : { refs: [] }))
      .then((b: { refs: { itemType: SavedItemType; itemId: number }[] }) => {
        if (!live) return;
        setKeys(new Set((b.refs ?? []).map((r) => key(r.itemType, r.itemId))));
        setReady(true);
      })
      .catch(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  const isSaved = useCallback((t: SavedItemType, id: number) => keys.has(key(t, id)), [keys]);

  const setSaved = useCallback((t: SavedItemType, id: number, value: boolean) => {
    setKeys((prev) => {
      const next = new Set(prev);
      if (value) next.add(key(t, id)); else next.delete(key(t, id));
      return next;
    });
  }, []);

  return { isSaved, setSaved, ready };
}
