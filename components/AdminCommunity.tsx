'use client';

import { useCallback, useEffect, useState } from 'react';

interface Post { id: number; authorName: string; postType: string; title: string; body: string; pinned: boolean; hidden: boolean; createdAt: string; upvotes: number; replyCount: number }

export default function AdminCommunity() {
  const [posts, setPosts] = useState<Post[]>([]);
  const load = useCallback(async () => {
    const r = await fetch('/api/admin/community');
    if (r.ok) setPosts((await r.json()).posts);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function patch(id: number, b: Record<string, unknown>) {
    await fetch(`/api/admin/community/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    load();
  }
  async function remove(id: number) {
    if (!confirm('Delete this post and its replies?')) return;
    await fetch(`/api/admin/community/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-3">
      {posts.length === 0 && <p className="text-sm text-ink2/70">No community posts yet.</p>}
      {posts.map((p) => (
        <div key={p.id} className={`flex flex-wrap items-center justify-between gap-3 border p-4 ${p.hidden ? 'border-stone bg-cream opacity-70' : 'border-stone bg-white'}`}>
          <div className="min-w-0">
            <p className="font-heading text-ink">{p.pinned && <span className="mr-2 text-xs text-terracotta">Pinned</span>}{p.title} {p.hidden && <span className="text-xs text-ink2/50">(hidden)</span>}</p>
            <p className="text-xs text-ink2/60">{p.authorName} · {p.postType} · {p.upvotes} upvotes · {p.replyCount} replies</p>
          </div>
          <div className="flex shrink-0 gap-2 text-xs">
            <button onClick={() => patch(p.id, { pinned: !p.pinned })} className="rounded-pill bg-white px-3 py-1 text-[13px] text-ink2 shadow-card transition-colors hover:text-ink">{p.pinned ? 'Unpin' : 'Pin'}</button>
            <button onClick={() => patch(p.id, { hidden: !p.hidden })} className="rounded-pill bg-white px-3 py-1 text-[13px] text-ink2 shadow-card transition-colors hover:text-ink">{p.hidden ? 'Show' : 'Hide'}</button>
            <button onClick={() => remove(p.id)} className="rounded-pill px-3 py-1 text-[13px] text-terracotta ring-1 ring-terracotta/30 transition-colors hover:bg-terracotta/10">Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
