'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ChatInsights from '@/components/ChatInsights';

interface Convo {
  id: number; practitionerName: string; practitionerEmail: string;
  status: 'open' | 'closed'; lastMessage: string | null; lastMessageAt: string | null;
  adminUnread: number; updatedAt: string; online: boolean;
}
interface Msg { id: number; sender: 'practitioner' | 'admin'; body: string; createdAt: string }
interface OnlineP { id: number; name: string; email: string; lastSeenAt: string; conversationId: number | null }

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
  const [online, setOnline] = useState<OnlineP[]>([]);
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

  const loadOnline = useCallback(async () => {
    const res = await fetch('/api/admin/presence', { cache: 'no-store' });
    if (res.ok) setOnline((await res.json()).online);
  }, []);

  useEffect(() => { loadList(); loadOnline(); }, [loadList, loadOnline]);

  // Poll the list, and the open thread, so replies + new messages appear live.
  useEffect(() => {
    const t = setInterval(() => {
      loadList();
      loadOnline();
      if (activeRef.current) loadThread(activeRef.current);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [loadList, loadOnline, loadThread]);

  useEffect(() => { bottomRef.current?.scrollIntoView(); }, [messages.length]);

  async function openConvo(id: number) {
    setActiveId(id);
    await loadThread(id);
    loadList(); // unread cleared server-side on view
  }

  async function openOrStart(o: OnlineP) {
    if (o.conversationId) { await openConvo(o.conversationId); return; }
    const res = await fetch('/api/admin/chat', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ practitionerId: o.id }),
    });
    if (res.ok) {
      const { conversationId } = await res.json();
      await loadList();
      await openConvo(conversationId);
    }
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
      <div className="mb-4 flex gap-2 border-b border-ink/10">
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
            className={`px-3 py-1.5 ${filter === f ? 'bg-navy text-white' : 'bg-stone/40 text-ink2'}`}>
            {f}
          </button>
        ))}
      </div>
      <div className="mb-3 rounded-lg rounded-card bg-white shadow-card p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-terracotta">
          Online now ({online.length})
        </div>
        {online.length === 0 ? (
          <p className="text-sm text-ink2/60">No practitioners online right now.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {online.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => openOrStart(o)}
                  title={`Message ${o.name}`}
                  className="flex items-center gap-2 rounded-full rounded-pill bg-white px-3 py-1 text-[13px] text-ink2 shadow-card transition-colors hover:text-ink text-sm hover:bg-cream">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" aria-hidden />
                  <span className="text-ink">{o.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-[20rem_1fr]">
        {/* Conversation list */}
        <div className="max-h-[32rem] overflow-y-auto rounded-card bg-white shadow-card">
          {convos.length === 0 && <p className="p-4 text-sm text-ink2/60">No conversations.</p>}
          {convos.map((c) => (
            <button key={c.id} onClick={() => openConvo(c.id)}
              className={`block w-full border-b border-ink/10 px-4 py-3 text-left hover:bg-cream ${activeId === c.id ? 'bg-cream' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium text-ink">
                  <span
                    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${c.online ? 'bg-green-500' : 'bg-stone'}`}
                    title={c.online ? 'Online now' : (c.lastMessageAt ? `Last active ${timeAgo(c.lastMessageAt)}` : 'Offline')}
                    aria-hidden
                  />
                  {c.practitionerName}
                </span>
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
        <div className="flex h-[32rem] flex-col rounded-card bg-blush">
          {!active ? (
            <p className="m-auto text-sm text-ink2/60">Select a conversation to view and reply.</p>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-ink/10 bg-white px-4 py-3">
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
                      m.sender === 'admin' ? 'bg-navy text-white' : 'bg-white text-ink shadow-card'
                    }`}>
                      {m.body}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={send} className="flex items-end gap-2 border-t border-ink/10 bg-white p-2.5">
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }}
                  rows={1} placeholder="Type your reply…"
                  className="max-h-24 flex-1 resize-none rounded-lg w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[14px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50" />
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
