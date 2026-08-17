'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadFile } from '@/lib/uploadClient';
import MediaCard from '@/components/MediaCard';

interface MediaRow {
  id: number; title: string; type: 'video' | 'document' | 'slides' | 'image';
  description: string | null; contentKind: 'file' | 'link'; url: string;
  thumbnailUrl: string | null; published: boolean; size: number | null;
}

const TYPES = [
  { id: 'video', label: 'Video' },
  { id: 'document', label: 'PDF / Document' },
  { id: 'slides', label: 'Presentation / Slides' },
  { id: 'image', label: 'Image / Infographic' },
] as const;

const input = 'w-full border border-stone px-3 py-2 text-sm focus:border-terracotta focus:outline-none';
const label = 'mb-1 block text-xs uppercase tracking-[0.15em] text-ink2';

export default function AdminMedia() {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MediaRow['type']>('document');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<'file' | 'link'>('file');
  const [linkUrl, setLinkUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [thumbNeeded, setThumbNeeded] = useState(false);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);

  const loadRows = useCallback(async () => {
    const res = await fetch('/api/admin/media');
    if (res.ok) setRows((await res.json()).media);
  }, []);
  useEffect(() => { loadRows(); }, [loadRows]);

  // When a link is pasted, ask the server for an auto thumbnail; require an upload if none.
  async function resolveLinkThumb(url: string) {
    setThumbPreview(null); setThumbNeeded(false);
    if (!url.trim()) return;
    const res = await fetch('/api/admin/media/thumbnail?url=' + encodeURIComponent(url.trim()));
    const { thumbnailUrl } = await res.json();
    if (thumbnailUrl) { setThumbPreview(thumbnailUrl); setThumbNeeded(false); }
    else setThumbNeeded(true);
  }

  // Image files are their own thumbnail; other file types need an uploaded thumbnail.
  function onPickFile(f: File | null, forType: MediaRow['type'] = type) {
    setFile(f);
    setThumbFile(null);
    setThumbPreview(null);
    setThumbNeeded(!!f && forType !== 'image');
    if (f && forType === 'image') setThumbPreview(URL.createObjectURL(f));
  }

  function applyType(nextType: MediaRow['type']) {
    setType(nextType);
    if (source === 'file') onPickFile(file, nextType);
  }

  function changeSource(next: 'file' | 'link') {
    setSource(next);
    setFile(null);
    setThumbFile(null);
    setThumbPreview(null);
    setThumbNeeded(false);
    setLinkUrl('');
    if (fileRef.current) fileRef.current.value = '';
    if (thumbRef.current) thumbRef.current.value = '';
  }

  function reset() {
    setTitle(''); setDescription(''); setLinkUrl(''); setFile(null);
    setThumbPreview(null); setThumbNeeded(false); setThumbFile(null);
    if (fileRef.current) fileRef.current.value = '';
    if (thumbRef.current) thumbRef.current.value = '';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (source === 'file' && !file) return setError('Choose a file to upload.');
    if (source === 'link' && !linkUrl.trim()) return setError('Paste a link.');
    if (thumbNeeded && !thumbFile) return setError('A thumbnail is required — upload one.');
    setBusy(true);
    // Storage keys we upload before the metadata POST. If anything after an
    // upload fails, these are orphaned (no media row references them) and get
    // cleaned up by key.
    const uploaded: string[] = [];
    try {
      // 1. Resolve the main URL (Blob upload for files, the raw URL for links).
      let url = linkUrl.trim();
      let pathname: string | null = null;
      let size: number | null = null;
      const contentKind = source;
      if (source === 'file' && file) {
        const blob = await uploadFile(`media/${Date.now()}-${file.name}`, file);
        url = blob.url; pathname = blob.pathname; size = file.size;
        uploaded.push(blob.pathname);
      }
      // 2. Resolve the thumbnail URL.
      let thumbnailUrl: string | null = null;
      let thumbnailPathname: string | null = null;
      if (source === 'file' && type === 'image' && file) {
        thumbnailUrl = url; // the image itself
      } else if (thumbFile) {
        const t = await uploadFile(`thumbnails/${Date.now()}-${thumbFile.name}`, thumbFile);
        thumbnailUrl = t.url; thumbnailPathname = t.pathname;
        uploaded.push(t.pathname);
      } else if (thumbPreview) {
        thumbnailUrl = thumbPreview; // auto-derived remote thumbnail
      }
      // 3. Save metadata.
      const res = await fetch('/api/admin/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type, description: description || null, contentKind, url, pathname, thumbnailUrl, thumbnailPathname, size }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed');
      reset();
      await loadRows();
    } catch (err) {
      // Compensating cleanup: delete any blobs uploaded before the failure so
      // they don't leak as unreferenced, billable objects. Best-effort.
      if (uploaded.length) {
        try {
          await fetch('/api/admin/media/cleanup', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keys: uploaded }),
          });
        } catch { /* swallow — the original error below is what matters */ }
      }
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: number, published: boolean) {
    await fetch(`/api/admin/media/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ published }) });
    loadRows();
  }
  async function remove(id: number) {
    if (!confirm('Delete this media item?')) return;
    await fetch(`/api/admin/media/${id}`, { method: 'DELETE' });
    loadRows();
  }

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_2fr]">
      {/* Add form */}
      <form onSubmit={submit} className="border border-stone bg-white p-6">
        <h2 className="font-heading text-xl text-ink">Add media</h2>
        {error && <p className="mt-3 border border-terracotta bg-cream px-3 py-2 text-sm text-terracotta">{error}</p>}
        <div className="mt-4 space-y-4">
          <div><label className={label}>Title</label><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
          <div>
            <label className={label}>Type</label>
            <select className={input} value={type} onChange={(e) => applyType(e.target.value as MediaRow['type'])}>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div><label className={label}>Description</label><textarea className={input} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={source === 'file'} onChange={() => changeSource('file')} className="accent-terracotta" /> Upload file</label>
            <label className="flex items-center gap-2"><input type="radio" checked={source === 'link'} onChange={() => changeSource('link')} className="accent-terracotta" /> Paste link</label>
          </div>
          {source === 'file' ? (
            <div><label className={label}>File</label><input ref={fileRef} type="file" className={input} onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} /></div>
          ) : (
            <div><label className={label}>Link (YouTube, Vimeo, or any URL)</label><input className={input} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onBlur={(e) => resolveLinkThumb(e.target.value)} /></div>
          )}
          {thumbPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbPreview} alt="thumbnail preview" className="aspect-video w-full border border-stone object-cover" />
          )}
          {thumbNeeded && (
            <div>
              <label className={label}>Thumbnail required (no preview found)</label>
              <input ref={thumbRef} type="file" accept="image/*" className={input} onChange={(e) => { const f = e.target.files?.[0] ?? null; setThumbFile(f); if (f) setThumbPreview(URL.createObjectURL(f)); }} />
            </div>
          )}
          <button disabled={busy} className="w-full bg-ink px-6 py-3 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta disabled:opacity-50">
            {busy ? 'Saving…' : 'Add media'}
          </button>
        </div>
      </form>

      {/* Media list */}
      <div>
        {rows.length === 0 ? (
          <p className="text-sm text-ink2/70">No media yet. Add your first item on the left.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((m) => (
              <MediaCard key={m.id} item={m}>
                <div className="mt-3 flex items-center gap-3 border-t border-stone pt-3 text-xs">
                  <span className={m.published ? 'text-forest' : 'text-ink2/60'}>{m.published ? 'Visible' : 'Hidden'}</span>
                  <button onClick={() => toggle(m.id, !m.published)} className="uppercase tracking-[0.15em] text-ink2/70 hover:text-terracotta">{m.published ? 'Hide' : 'Show'}</button>
                  <button onClick={() => remove(m.id)} className="uppercase tracking-[0.15em] text-terracotta hover:underline">Delete</button>
                </div>
              </MediaCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
