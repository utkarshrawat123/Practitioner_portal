'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, Label, Loading, Pill, inputClass } from '@/components/ui';

interface Post {
  id: number; authorName: string; postType: string; title: string; body: string;
  pinned: boolean; createdAt: string; upvotes: number; replyCount: number; upvotedByMe: boolean;
}
interface Reply { id: number; authorName: string; body: string; createdAt: string }

const TYPE_LABELS: Record<string, string> = { discussion: 'Discussion', ask_expert: 'Ask the Expert', member_spotlight: 'Member Spotlight' };
const label = 'text-[11px] font-medium uppercase tracking-label text-ink2/55';
const input = inputClass;

export default function CommunityApp({ fbGroupUrl }: { fbGroupUrl: string | null }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [form, setForm] = useState({ postType: 'discussion', title: '', body: '' });
  const [open, setOpen] = useState<number | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [replyText, setReplyText] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/me/community');
    if (r.status === 401) { setAuthed(false); return; }
    setAuthed(true);
    setPosts((await r.json()).posts);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createPost(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    await fetch('/api/me/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setForm({ postType: 'discussion', title: '', body: '' });
    load();
  }
  async function upvote(id: number) {
    await fetch(`/api/me/community/${id}/upvote`, { method: 'POST' });
    load();
  }
  async function openPost(id: number) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    const d = await fetch(`/api/me/community/${id}`).then((r) => r.json());
    setReplies(d.replies);
  }
  async function addReply(id: number) {
    if (!replyText.trim()) return;
    await fetch(`/api/me/community/${id}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: replyText }) });
    setReplyText('');
    const d = await fetch(`/api/me/community/${id}`).then((r) => r.json());
    setReplies(d.replies);
    load();
  }

  if (authed === false) return <div className="mx-auto max-w-3xl px-6 py-24 text-center"><h1 className="font-heading text-3xl text-ink">Community</h1><p className="mt-3 text-ink2/80">Please <a href="/dashboard" className="text-terracotta underline">sign in</a>.</p></div>;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-10 lg:py-12">
      <Label>Community</Label>
      <h1 className="mt-2 font-heading text-[34px] leading-[1.15] tracking-[-0.01em] text-ink lg:text-[42px]">Practitioner Community</h1>

      {fbGroupUrl && (
        <a href={fbGroupUrl} target="_blank" rel="noopener noreferrer" className="mt-8 flex items-center justify-between gap-4 rounded-card bg-blush p-6 shadow-card transition-shadow hover:shadow-lift">
          <div><p className="font-heading text-[19px] text-ink">Private Practitioner Facebook Group</p><p className="mt-1 text-[14px] text-ink2/70">Members-only · peer discussion, live Q&amp;As and announcements.</p></div>
          <span className="shrink-0 text-[11px] uppercase tracking-label text-terracotta">Open ↗</span>
        </a>
      )}

      <form onSubmit={createPost} className="mt-8 grid gap-4 rounded-card bg-white p-6 shadow-card">
        <span className={label}>Start a discussion</span>
        <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
          <label className="block"><span className={label}>Type</span>
            <select className={input} value={form.postType} onChange={(e) => setForm({ ...form, postType: e.target.value })}>
              <option value="discussion">Discussion</option><option value="ask_expert">Ask the Expert</option><option value="member_spotlight">Member Spotlight</option>
            </select></label>
          <label className="block"><span className={label}>Title</span><input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        </div>
        <label className="block"><span className={label}>Message</span><textarea className={input} rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
        <div><Button type="submit">Post</Button></div>
      </form>

      <div className="mt-8 space-y-4">
        {posts === null && <Loading />}
        {posts && posts.length === 0 && <Empty>No posts yet — start the first discussion.</Empty>}
        {(posts ?? []).map((p) => (
          <Card key={p.id} className="p-6">
            <div className="flex items-center gap-2">
              {p.pinned && <Pill>Pinned</Pill>}
              <Pill tone="sage">{TYPE_LABELS[p.postType] ?? p.postType}</Pill>
            </div>
            <p className="mt-3 font-heading text-[19px] leading-snug text-ink">{p.title}</p>
            <p className="mt-0.5 text-[12px] text-ink2/50">{p.authorName} · {p.createdAt.slice(0, 10)}</p>
            <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-ink2/80">{p.body}</p>
            <div className="mt-4 flex items-center gap-4 text-[13px]">
              <button onClick={() => upvote(p.id)} className={p.upvotedByMe ? 'text-terracotta' : 'text-ink2/60 hover:text-terracotta'}>▲ {p.upvotes}</button>
              <button onClick={() => openPost(p.id)} className="text-ink2/60 hover:text-terracotta">{p.replyCount} {p.replyCount === 1 ? 'reply' : 'replies'}</button>
            </div>
            {open === p.id && (
              <div className="mt-5 border-t border-ink/10 pt-4">
                <div className="space-y-3">
                  {replies.map((r) => (
                    <div key={r.id} className="text-sm"><span className="font-medium text-ink">{r.authorName}</span> <span className="text-xs text-ink2/50">{r.createdAt.slice(0, 10)}</span><p className="whitespace-pre-wrap text-ink2/80">{r.body}</p></div>
                  ))}
                  {replies.length === 0 && <p className="text-sm text-ink2/60">No replies yet.</p>}
                </div>
                <div className="mt-3 flex gap-2">
                  <input className={`${inputClass} mt-0 flex-1`} placeholder="Write a reply…" value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                  <Button onClick={() => addReply(p.id)}>Reply</Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
