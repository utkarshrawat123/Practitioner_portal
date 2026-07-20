'use client';

import { useEffect } from 'react';
import { PRESENCE_BEAT_MS as BEAT_MS } from '@/lib/presence/config';

/**
 * Invisible presence heartbeat. Mounted globally for signed-in practitioners
 * (see app/layout.tsx). POSTs /api/me/presence on mount, every 30s while the tab
 * is focused, and immediately when the tab regains focus. Best-effort: errors are
 * ignored. Not coupled to the chat widget — presence must not depend on chat being open.
 */
export default function PresenceBeat({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    if (!signedIn) return;

    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/me/presence', { method: 'POST', cache: 'no-store', keepalive: true }).catch(() => {});
    };

    beat(); // announce immediately on mount
    const timer = setInterval(beat, BEAT_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [signedIn]);

  return null;
}
