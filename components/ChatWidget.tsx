'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { shouldPoll, nextPollDelay, FAST_MS, CLOSED_BASE_MS } from '@/lib/chat/pollPolicy';

interface Msg { id: number; sender: 'practitioner' | 'admin'; body: string; createdAt: string }

/**
 * Practitioner-facing live-chat bubble. Polls /api/me/chat for admin replies
 * every ~2.5s while signed in; shows an unread dot when the panel is closed.
 * Mounted globally by ChatGate on signed-in, non-admin routes.
 */
export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const lastIdRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const merge = useCallback((incoming: Msg[], countUnread: boolean) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const next = [...prev, ...incoming.filter((m) => !seen.has(m.id))];
      return next.sort((a, b) => a.id - b.id);
    });
    lastIdRef.current = Math.max(lastIdRef.current, ...incoming.map((m) => m.id));
    if (countUnread) {
      const adminNew = incoming.filter((m) => m.sender === 'admin').length;
      if (adminNew > 0) setUnread((u) => u + adminNew);
    }
  }, []);

  const poll = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/me/chat?since=${lastIdRef.current}`, { cache: 'no-store' });
      if (!res.ok) return false;
      const data = await res.json();
      const incoming: Msg[] = data.messages ?? [];
      merge(incoming, true);
      return incoming.length > 0; // server returns only messages newer than `since`
    } catch { return false; } // offline blip — next tick retries
  }, [merge]);

  // Prime history once.
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch('/api/me/chat', { cache: 'no-store' });
      if (!alive || !res.ok) return;
      const data = await res.json();
      merge(data.messages ?? [], false);
    })();
    return () => { alive = false; };
  }, [merge]);

  // Adaptive poll loop: fast while the panel is open, slow with backoff while
  // closed, and paused entirely when the tab is hidden. Keyed on `open` so the
  // cadence re-evaluates the moment the panel opens or closes.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = open ? FAST_MS : CLOSED_BASE_MS;
    const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

    const tick = async () => {
      const gotNew = shouldPoll(isVisible()) ? await poll() : false;
      if (cancelled) return;
      delay = nextPollDelay({ open, visible: isVisible(), gotNew, currentDelay: delay });
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);

    // On regaining focus, reset to the base cadence and poll immediately.
    const onVisible = () => {
      if (!isVisible()) return;
      clearTimeout(timer);
      delay = open ? FAST_MS : CLOSED_BASE_MS;
      timer = setTimeout(tick, 0);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [open, poll]);

  // Clear the unread badge and scroll to newest whenever the panel is open.
  useEffect(() => {
    if (open) {
      setUnread(0);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft('');
    try {
      const res = await fetch('/api/me/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (res.ok) merge([(await res.json()).message], false);
      else setDraft(body); // restore on failure
    } catch { setDraft(body); }
    setSending(false);
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {open && (
        <div className="mb-3 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-stone bg-cream shadow-2xl">
          <div className="flex items-center justify-between bg-forest px-4 py-3 text-cream">
            <div>
              <p className="font-heading text-base leading-tight">Practitioner Support</p>
              <p className="text-[11px] opacity-80">We usually reply in a few minutes</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="text-cream/80 hover:text-cream">✕</button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <p className="mt-8 px-4 text-center text-sm text-ink2/70">
                Ask us anything — dosing, protocols, your account. A member of the team will reply here.
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === 'practitioner' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                  m.sender === 'practitioner' ? 'bg-terracotta text-cream' : 'bg-white text-ink border border-stone'
                }`}>
                  {m.body}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={send} className="flex items-end gap-2 border-t border-stone bg-white p-2.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }}
              rows={1}
              placeholder="Type a message…"
              className="max-h-24 flex-1 resize-none rounded-lg border border-stone px-3 py-2 text-sm focus:border-terracotta focus:outline-none"
            />
            <button
              disabled={sending || !draft.trim()}
              className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-cream disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open support chat"
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-forest text-cream shadow-xl transition-transform hover:scale-105"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {unread > 0 && !open && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-terracotta px-1 text-[11px] font-semibold text-cream">
            {unread}
          </span>
        )}
      </button>
    </div>
  );
}
