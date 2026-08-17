'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadFile } from '@/lib/uploadClient';

interface Resource {
  id: number; title: string; type: string; description: string | null;
  audience: 'all' | 'qualified' | 'student'; contentKind: 'file' | 'link' | 'text';
  url: string | null; body: string | null; published: boolean;
}

const TYPES = [
  { id: 'handout', label: 'Handout' },
  { id: 'protocol', label: 'Protocol' },
  { id: 'decision_tree', label: 'Decision tree' },
  { id: 'recipe', label: 'Recipe' },
  { id: 'faq', label: 'FAQ' },
  { id: 'email_template', label: 'Email template' },
];

const label = 'text-xs uppercase tracking-[0.15em] text-ink2/70';
const input = 'mt-1 w-full border border-stone px-3 py-2 focus:border-terracotta focus:outline-none';

const EMPTY = {
  title: '', type: 'handout', audience: 'all' as const, contentKind: 'link' as 'file' | 'link' | 'text',
  description: '', url: '', body: '',
};

export default function AdminToolkit() {
  const [rows, setRows] = useState<Resource[]>([]);
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/toolkit');
    if (res.ok) setRows((await res.json()).resources);
  }, []);
  useEffect(() => { load(); }, [load]);

  function reset() {
    setForm({ ...EMPTY });
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) return setError('Give the resource a title.');
    if (form.contentKind === 'link' && !form.url.trim()) return setError('Paste a link.');
    if (form.contentKind === 'file' && !file) return setError('Choose a file to upload.');
    if (form.contentKind === 'text' && !form.body.trim()) return setError('Enter the resource text.');
    setBusy(true);
    try {
      let url: string | null = form.url.trim() || null;
      let pathname: string | null = null;
      if (form.contentKind === 'file' && file) {
        const blob = await uploadFile(`toolkit/${Date.now()}-${file.name}`, file);
        url = blob.url; pathname = blob.pathname;
      }
      const res = await fetch('/api/admin/toolkit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title, type: form.type, audience: form.audience, contentKind: form.contentKind,
          description: form.description || null,
          url: form.contentKind === 'text' ? null : url,
          body: form.contentKind === 'text' ? form.body : null,
          pathname,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save');
      reset();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: number, body: Record<string, unknown>) {
    await fetch(`/api/admin/toolkit/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    load();
  }
  async function remove(id: number) {
    if (!confirm('Delete this resource?')) return;
    await fetch(`/api/admin/toolkit/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-2">
      {/* Create */}
      <form onSubmit={create} className="grid gap-4 border border-stone bg-white p-6">
        <span className={label}>New toolkit resource</span>
        <label className="block"><span className={label}>Title</span>
          <input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={label}>Type</span>
            <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select></label>
          <label className="block"><span className={label}>Audience</span>
            <select className={input} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as typeof form.audience })}>
              <option value="all">Everyone</option><option value="qualified">Qualified only</option><option value="student">Students only</option>
            </select></label>
        </div>
        <label className="block"><span className={label}>Description (optional)</span>
          <input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div>
          <span className={label}>Content</span>
          <div className="mt-1 inline-flex rounded-sm border border-stone p-0.5 text-xs">
            {(['link', 'file', 'text'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setForm({ ...form, contentKind: k })}
                className={`px-3 py-1.5 uppercase tracking-[0.15em] ${form.contentKind === k ? 'bg-ink text-cream' : 'text-ink2/70'}`}>
                {k}
              </button>
            ))}
          </div>
        </div>
        {form.contentKind === 'link' && (
          <label className="block"><span className={label}>Link URL</span>
            <input className={input} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></label>
        )}
        {form.contentKind === 'file' && (
          <label className="block"><span className={label}>File (PDF, doc, image…)</span>
            <input ref={fileRef} type="file" className={`${input} py-1.5`} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        )}
        {form.contentKind === 'text' && (
          <label className="block"><span className={label}>Body text (FAQ answer, email template…)</span>
            <textarea className={input} rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
        )}
        {error && <p className="text-sm text-terracotta">{error}</p>}
        <button disabled={busy} className="bg-ink px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta disabled:opacity-60">
          {busy ? 'Saving…' : 'Add resource'}
        </button>
      </form>

      {/* List */}
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-ink2/70">No resources yet.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between border border-stone bg-white p-3">
            <div className="min-w-0">
              <p className="font-heading text-ink">{r.title} {!r.published && <span className="text-xs text-ink2/50">(hidden)</span>}</p>
              <p className="text-xs text-ink2/60">{r.type} · {r.contentKind} · {r.audience}</p>
            </div>
            <div className="flex shrink-0 gap-2 text-xs">
              <button onClick={() => patch(r.id, { published: !r.published })} className="border border-stone px-2 py-1">{r.published ? 'Hide' : 'Publish'}</button>
              <button onClick={() => remove(r.id)} className="border border-terracotta px-2 py-1 text-terracotta">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
