'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadFile } from '@/lib/uploadClient';

const CATEGORIES = [
  'Women’s Health', 'Hormone Health', 'Gut Health', 'Immune Health',
  'Children’s Health', 'Joint Health', 'Heart Health', 'Brain Health',
];

interface Pathway {
  id: number; title: string; description: string | null; category: string | null;
  cpdHours: number; audience: 'all' | 'qualified' | 'student'; published: boolean;
}
interface Module {
  id: number; title: string; contentKind: 'lesson' | 'media'; contentId: number; position: number; required: boolean;
}
interface ContentItem { id: number; title: string }

const label = 'text-[11px] font-medium uppercase tracking-label text-ink2/55';
const input = 'mt-1 w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[15px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50';

export default function AdminPathways() {
  const [pathways, setPathways] = useState<Pathway[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [content, setContent] = useState<{ lessons: ContentItem[]; media: (ContentItem & { type: string })[] }>({ lessons: [], media: [] });
  const [form, setForm] = useState({ title: '', category: CATEGORIES[0], cpdHours: 1, audience: 'all' as const, description: '', published: false });
  // Default to "New training video" — the primary way to add a lecture, and the
  // one that works from a standing start (the "Existing …" options are empty until
  // standalone lessons/media exist elsewhere).
  const [mod, setMod] = useState({ kind: 'video' as 'lesson' | 'media' | 'video', contentId: '', title: '', required: true });
  const [vid, setVid] = useState({ source: 'link' as 'link' | 'file', url: '', file: null as File | null, busy: false, error: '' });
  const vidFileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/pathways');
    if (res.ok) setPathways((await res.json()).pathways);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openPathway = useCallback(async (id: number) => {
    setSelected(id);
    const [d, c] = await Promise.all([
      fetch(`/api/admin/pathways/${id}`).then((r) => r.json()),
      fetch('/api/admin/pathways/content').then((r) => r.json()),
    ]);
    setModules(d.modules);
    setContent(c);
  }, []);

  async function createPathway(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const res = await fetch('/api/admin/pathways', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: form.title, category: form.category, cpdHours: Number(form.cpdHours), audience: form.audience, description: form.description || null, published: form.published }),
    });
    if (res.ok) {
      const { pathway } = await res.json();
      setForm({ ...form, title: '', description: '' });
      await load();
      // Jump straight into building the new course's modules — no hunting for it
      // in the list first.
      if (pathway?.id) openPathway(pathway.id);
    } else {
      setError((await res.json()).error ?? 'Could not save');
    }
  }

  async function patchPathway(id: number, body: Record<string, unknown>) {
    await fetch(`/api/admin/pathways/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    load();
  }
  async function removePathway(id: number) {
    if (!confirm('Delete this pathway and its modules?')) return;
    await fetch(`/api/admin/pathways/${id}`, { method: 'DELETE' });
    if (selected === id) { setSelected(null); setModules([]); }
    load();
  }

  async function addModule(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !mod.contentId) return;
    const list = mod.kind === 'lesson' ? content.lessons : content.media;
    const picked = list.find((x) => x.id === Number(mod.contentId));
    await fetch(`/api/admin/pathways/${selected}/modules`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: mod.title || picked?.title || 'Module', contentKind: mod.kind, contentId: Number(mod.contentId), position: modules.length, required: mod.required }),
    });
    setMod({ ...mod, contentId: '', title: '' });
    openPathway(selected);
  }
  async function addVideoModule(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const title = mod.title.trim();
    if (!title) { setVid({ ...vid, error: 'Give the video a title.' }); return; }
    if (vid.source === 'link' && !vid.url.trim()) { setVid({ ...vid, error: 'Paste a video link.' }); return; }
    if (vid.source === 'file' && !vid.file) { setVid({ ...vid, error: 'Choose a video file to upload.' }); return; }
    setVid({ ...vid, busy: true, error: '' });
    try {
      // 1. Create the underlying media item (uploaded file or pasted link).
      let url = vid.url.trim();
      let pathname: string | null = null;
      let size: number | null = null;
      if (vid.source === 'file' && vid.file) {
        const blob = await uploadFile(`media/${Date.now()}-${vid.file.name}`, vid.file);
        url = blob.url; pathname = blob.pathname; size = vid.file.size;
      }
      const mediaRes = await fetch('/api/admin/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type: 'video', contentKind: vid.source, url, pathname, size }),
      });
      if (!mediaRes.ok) throw new Error((await mediaRes.json()).error ?? 'Could not save the video');
      const mediaId = (await mediaRes.json()).media.id as number;
      // 2. Attach it to this pathway as a module.
      await fetch(`/api/admin/pathways/${selected}/modules`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, contentKind: 'media', contentId: mediaId, position: modules.length, required: mod.required }),
      });
      setMod({ ...mod, title: '' });
      setVid({ source: 'link', url: '', file: null, busy: false, error: '' });
      if (vidFileRef.current) vidFileRef.current.value = '';
      openPathway(selected);
    } catch (err) {
      setVid({ ...vid, busy: false, error: err instanceof Error ? err.message : 'Upload failed' });
    }
  }

  async function moveModule(index: number, dir: -1 | 1) {
    if (!selected) return;
    const a = modules[index]; const b = modules[index + dir];
    if (!a || !b) return;
    await fetch(`/api/admin/pathways/${selected}/modules/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: b.position }) });
    await fetch(`/api/admin/pathways/${selected}/modules/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: a.position }) });
    openPathway(selected);
  }
  async function toggleRequired(m: Module) {
    if (!selected) return;
    await fetch(`/api/admin/pathways/${selected}/modules/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ required: !m.required }) });
    openPathway(selected);
  }
  async function removeModule(m: Module) {
    if (!selected) return;
    await fetch(`/api/admin/pathways/${selected}/modules/${m.id}`, { method: 'DELETE' });
    openPathway(selected);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Left: create + list */}
      <div className="space-y-6">
        <form onSubmit={createPathway} className="grid gap-4 rounded-card bg-white shadow-card p-6">
          <span className={label}>New pathway</span>
          <label className="block"><span className={label}>Title</span>
            <input className={input} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className={label}>Category</span>
              <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></label>
            <label className="block"><span className={label}>CPD hours</span>
              <input type="number" min={0} step={0.5} className={input} value={form.cpdHours} onChange={(e) => setForm({ ...form, cpdHours: Number(e.target.value) })} /></label>
          </div>
          <label className="block"><span className={label}>Audience</span>
            <select className={input} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as typeof form.audience })}>
              <option value="all">Everyone</option><option value="qualified">Qualified only</option><option value="student">Students only</option>
            </select></label>
          <label className="block"><span className={label}>Description</span>
            <textarea className={input} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> Publish immediately</label>
          {error && <p className="text-sm text-terracotta">{error}</p>}
          <button className="inline-flex items-center justify-center rounded-pill bg-navy px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-navy-mid disabled:opacity-50 hover:bg-terracotta">Create pathway</button>
        </form>

        <div className="space-y-2">
          {pathways.length === 0 && <p className="text-sm text-ink2/70">No pathways yet.</p>}
          {pathways.map((p) => (
            <div key={p.id} className={`flex items-center justify-between border p-3 ${selected === p.id ? 'border-terracotta' : 'border-stone'} bg-white`}>
              <button onClick={() => openPathway(p.id)} className="min-w-0 text-left">
                <p className="font-heading text-ink">{p.title} {!p.published && <span className="text-xs text-ink2/50">(draft)</span>}</p>
                <p className="text-xs text-ink2/60">{p.category ?? 'Uncategorised'} · {p.cpdHours} CPD h · {p.audience}</p>
              </button>
              <div className="flex shrink-0 gap-2 text-xs">
                <button onClick={() => patchPathway(p.id, { published: !p.published })} className="ring-1 ring-ink/10 px-2 py-1">{p.published ? 'Unpublish' : 'Publish'}</button>
                <button onClick={() => removePathway(p.id)} className="border border-terracotta px-2 py-1 text-terracotta">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: module builder */}
      <div className="rounded-card bg-white shadow-card p-6">
        {selected === null ? (
          <p className="text-sm text-ink2/70">Select a pathway to build its modules.</p>
        ) : (
          <>
            <span className={label}>Modules</span>
            <div className="mt-3 space-y-2">
              {modules.length === 0 && <p className="text-sm text-ink2/60">No modules yet.</p>}
              {modules.map((m, i) => (
                <div key={m.id} className="flex items-center justify-between ring-1 ring-ink/10 p-2 text-sm">
                  <div className="min-w-0"><span className="font-medium">{i + 1}. {m.title}</span>
                    <span className="ml-2 text-xs text-ink2/50">{m.contentKind}#{m.contentId}{m.required ? ' · required' : ' · optional'}</span></div>
                  <div className="flex shrink-0 items-center gap-1 text-xs">
                    <button onClick={() => moveModule(i, -1)} disabled={i === 0} className="ring-1 ring-ink/10 px-2 disabled:opacity-40">↑</button>
                    <button onClick={() => moveModule(i, 1)} disabled={i === modules.length - 1} className="ring-1 ring-ink/10 px-2 disabled:opacity-40">↓</button>
                    <button onClick={() => toggleRequired(m)} className="ring-1 ring-ink/10 px-2 py-1">{m.required ? 'Make optional' : 'Make required'}</button>
                    <button onClick={() => removeModule(m)} className="border border-terracotta px-2 py-1 text-terracotta">✕</button>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={mod.kind === 'video' ? addVideoModule : addModule} className="mt-5 grid gap-3 border-t border-ink/10 pt-4">
              <span className={label}>Add session</span>
              <label className="block"><span className={label}>Type</span>
                <select className={input} value={mod.kind} onChange={(e) => setMod({ ...mod, kind: e.target.value as 'lesson' | 'media' | 'video', contentId: '' })}>
                  <option value="video">New training video</option>
                  <option value="media">Existing media</option>
                  <option value="lesson">Existing lesson</option>
                </select></label>

              {mod.kind === 'video' ? (
                <>
                  <label className="block"><span className={label}>Video title</span>
                    <input className={input} required value={mod.title} onChange={(e) => setMod({ ...mod, title: e.target.value })} placeholder="e.g. Session 1 — Gut health foundations" /></label>
                  <div className="inline-flex rounded-pill bg-blush p-1 text-[12px]">
                    {(['link', 'file'] as const).map((s) => (
                      <button key={s} type="button" onClick={() => setVid({ ...vid, source: s, error: '' })}
                        className={`rounded-pill px-3.5 py-1.5 uppercase tracking-label transition-colors ${vid.source === s ? 'bg-white text-ink shadow-card' : 'text-ink2/60 hover:text-ink'}`}>
                        {s === 'link' ? 'Paste link' : 'Upload file'}
                      </button>
                    ))}
                  </div>
                  {vid.source === 'link' ? (
                    <label className="block"><span className={label}>Video link (YouTube, Vimeo, Loom…)</span>
                      <input className={input} value={vid.url} onChange={(e) => setVid({ ...vid, url: e.target.value })} placeholder="https://youtu.be/…" /></label>
                  ) : (
                    <label className="block"><span className={label}>Video file (mp4, up to 500 MB)</span>
                      <input ref={vidFileRef} type="file" accept="video/*" className={`${input} py-1.5`} onChange={(e) => setVid({ ...vid, file: e.target.files?.[0] ?? null })} /></label>
                  )}
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mod.required} onChange={(e) => setMod({ ...mod, required: e.target.checked })} /> Required for completion</label>
                  {vid.error && <p className="text-sm text-terracotta">{vid.error}</p>}
                  <button disabled={vid.busy} className="inline-flex items-center justify-center rounded-pill bg-navy px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-navy-mid disabled:opacity-50 hover:bg-terracotta disabled:opacity-60">
                    {vid.busy ? 'Saving…' : 'Add video session'}
                  </button>
                </>
              ) : (
                <>
                  {(mod.kind === 'lesson' ? content.lessons : content.media).length === 0 ? (
                    <p className="text-sm text-ink2/70">
                      No existing {mod.kind === 'lesson' ? 'lessons' : 'media'} yet. Switch Type to
                      <strong> New training video</strong> to add a lecture directly, or create
                      {mod.kind === 'lesson' ? ' a lesson in the Lessons tab' : ' media in the Media tab'} first.
                    </p>
                  ) : (
                    <label className="block"><span className={label}>Content</span>
                      <select className={input} required value={mod.contentId} onChange={(e) => setMod({ ...mod, contentId: e.target.value })}>
                        <option value="">Select…</option>
                        {(mod.kind === 'lesson' ? content.lessons : content.media).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                      </select></label>
                  )}
                  <label className="block"><span className={label}>Session title (optional)</span>
                    <input className={input} value={mod.title} onChange={(e) => setMod({ ...mod, title: e.target.value })} placeholder="Defaults to content title" /></label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mod.required} onChange={(e) => setMod({ ...mod, required: e.target.checked })} /> Required for completion</label>
                  <button className="inline-flex items-center justify-center rounded-pill bg-navy px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-navy-mid disabled:opacity-50 hover:bg-terracotta">Add session</button>
                </>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
