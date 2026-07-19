'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ChatInsights from '@/components/ChatInsights';

interface Convo {
  id: number; practitionerName: string; practitionerEmail: string;
  status: 'open' | 'closed'; lastMessage: string | null; lastMessageAt: string | null;
  adminUnread: number; updatedAt: string;
}
interface Msg { id: number; sender: 'practitioner' | 'admin'; body: string; createdAt: string }

const POLL_MS = 2500;

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime()) / 1000));
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

/** Admin Live Chat: conversation list (left) + thread with reply box (right). */
export default function AdminChat() {
  const [view, setView] = useState<'conversations' | 'insights'>('conversations');
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const activeRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  activeRef.current = activeId;

  const loadList = useCallback(async () => {
    const q = filter === 'all' ? '' : `?status=${filter}`;
    const res = await fetch(`/api/admin/chat${q}`, { cache: 'no-store' });
    if (res.ok) setConvos((await res.json()).conversations);
  }, [filter]);

  const loadThread = useCallback(async (id: number) => {
    const res = await fetch(`/api/admin/chat/${id}`, { cache: 'no-store' });
    if (res.ok) setMessages((await res.json()).messages);
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  // Poll the list, and the open thread, so replies + new messages appear live.
  useEffect(() => {
    const t = setInterval(() => {
      loadList();
      if (activeRef.current) loadThread(activeRef.current);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [loadList, loadThread]);

  useEffect(() => { bottomRef.current?.scrollIntoView(); }, [messages.length]);

  async function openConvo(id: number) {
    setActiveId(id);
    await loadThread(id);
    loadList(); // unread cleared server-side on view
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    setDraft('');
    const res = await fetch(`/api/admin/chat/${activeId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (res.ok) { await loadThread(activeId); loadList(); } else { setDraft(body); }
    setSending(false);
  }

  async function toggleStatus(id: number, status: 'open' | 'closed') {
    await fetch(`/api/admin/chat/${id}/close`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    loadList();
    if (activeId === id) loadThread(id);
  }

  const active = convos.find((c) => c.id === activeId);

  return (
    <div className="mt-6">
      <div className="mb-4 flex gap-2 border-b border-stone">
        {(['conversations', 'insights'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 text-xs uppercase tracking-[0.15em] ${
              view === v ? 'border-b-2 border-terracotta text-terracotta' : 'text-ink2/70'
            }`}>
            {v === 'conversations' ? 'Conversations' : 'Insights & FAQs'}
          </button>
        ))}
      </div>

      {view === 'insights' ? <ChatInsights /> : (
      <>
      <div className="mb-3 flex gap-2 text-xs uppercase tracking-[0.15em]">
        {(['open', 'closed', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 ${filter === f ? 'bg-forest text-cream' : 'bg-stone/40 text-ink2'}`}>
            {f}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-[20rem_1fr]">
        {/* Conversation list */}
        <div className="max-h-[32rem] overflow-y-auto border border-stone bg-white">
          {convos.length === 0 && <p className="p-4 text-sm text-ink2/60">No conversations.</p>}
          {convos.map((c) => (
            <button key={c.id} onClick={() => openConvo(c.id)}
              className={`block w-full border-b border-stone px-4 py-3 text-left hover:bg-cream ${activeId === c.id ? 'bg-cream' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">{c.practitionerName}</span>
                <span className="flex items-center gap-2">
                  {c.adminUnread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-terracotta px-1 text-[11px] font-semibold text-cream">
                      {c.adminUnread}
                    </span>
                  )}
                  <span className="text-[11px] text-ink2/60">{timeAgo(c.lastMessageAt)}</span>
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-ink2/70">{c.lastMessage ?? '—'}</p>
              {c.status === 'closed' && <span className="text-[10px] uppercase tracking-wide text-ink2/50">closed</span>}
            </button>
          ))}
        </div>

        {/* Thread */}
        <div className="flex h-[32rem] flex-col border border-stone bg-cream">
          {!active ? (
            <p className="m-auto text-sm text-ink2/60">Select a conversation to view and reply.</p>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-stone bg-white px-4 py-3">
                <div>
                  <p className="font-medium text-ink">{active.practitionerName}</p>
                  <p className="text-[11px] text-ink2/60">{active.practitionerEmail}</p>
                </div>
                <button onClick={() => toggleStatus(active.id, active.status === 'open' ? 'closed' : 'open')}
                  className="text-xs uppercase tracking-[0.15em] text-ink2 hover:text-terracotta">
                  {active.status === 'open' ? 'Close' : 'Reopen'}
                </button>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                      m.sender === 'admin' ? 'bg-forest text-cream' : 'bg-white text-ink border border-stone'
                    }`}>
                      {m.body}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={send} className="flex items-end gap-2 border-t border-stone bg-white p-2.5">
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }}
                  rows={1} placeholder="Type your reply…"
                  className="max-h-24 flex-1 resize-none rounded-lg border border-stone px-3 py-2 text-sm focus:border-terracotta focus:outline-none" />
                <button disabled={sending || !draft.trim()}
                  className="rounded-lg bg-terracotta px-4 py-2 text-sm font-medium text-cream disabled:opacity-50">
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
