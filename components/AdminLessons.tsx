'use client';

import { useCallback, useEffect, useState } from 'react';

interface Quiz { question: string; options: string[]; correctIndex: number; explanation: string }
interface Lesson {
  id: number; sourceFile: string | null; title: string; summary: string;
  takeaways: string[]; quiz: Quiz; topics: string[]; claimFlags: string[];
  status: string; createdAt: string;
}

const card = 'rounded-card bg-white p-6 shadow-card';
const label = 'text-[11px] font-medium uppercase tracking-label text-ink2/55';
const input = 'w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[14px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50';

export default function AdminLessons() {
  const [rows, setRows] = useState<Lesson[]>([]);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [draft, setDraft] = useState<Lesson | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/lessons');
    if (res.ok) setRows((await res.json()).lessons);
  }, []);

  useEffect(() => { load(); }, [load]);

  function select(l: Lesson) {
    setSelected(l);
    setDraft(JSON.parse(JSON.stringify(l)));
  }

  async function act(action: 'save' | 'approve' | 'reject') {
    if (!draft) return;
    setBusy(true);
    const payload =
      action === 'save'
        ? {
            action,
            fields: {
              title: draft.title, summary: draft.summary, takeaways: draft.takeaways,
              quiz: draft.quiz, topics: draft.topics,
            },
          }
        : { action };
    const res = await fetch(`/api/admin/lessons/${draft.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const { lesson } = await res.json();
      setSelected(lesson);
      setDraft(JSON.parse(JSON.stringify(lesson)));
      load();
    }
    setBusy(false);
  }

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <div className="h-fit min-w-0 overflow-x-auto">
      <table className="w-full border-collapse bg-white text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-[0.1em] text-ink2/70">
            <th className="p-3">Title</th><th className="p-3">Status</th>
            <th className="p-3">Flags</th><th className="p-3">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr
              key={l.id}
              onClick={() => select(l)}
              className={`cursor-pointer border-b border-ink/8 align-top hover:bg-cream ${
                selected?.id === l.id ? 'bg-sage/30' : ''
              }`}
            >
              <td className="p-3">{l.title}</td>
              <td className="p-3">
                <span className={
                  l.status === 'published' ? 'text-terracotta' :
                  l.status === 'rejected' ? 'text-ink2/50' : 'text-terracotta'
                }>{l.status}</span>
              </td>
              <td className="p-3">{l.claimFlags.length || '—'}</td>
              <td className="p-3 text-xs text-ink2/60">{l.sourceFile}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={4} className="p-6 text-center text-ink2/60">No lessons yet. Run <code>npm run generate-lessons</code>.</td></tr>
          )}
        </tbody>
      </table>
      </div>

      {draft && (
        <div className={`${card} h-fit`}>
          {draft.claimFlags.length > 0 && (
            <div className="mb-4 border-l-4 border-terracotta bg-cream p-4">
              <p className="font-heading text-lg text-terracotta">Clinical-claim flags — check before publishing</p>
              <ul className="mt-2 list-inside list-disc text-sm text-ink2/90">
                {draft.claimFlags.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}

          <label className={label}>Title</label>
          <input className={`${input} mt-1`} value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })} />

          <label className={`${label} mt-4 block`}>Summary</label>
          <textarea className={`${input} mt-1`} rows={6} value={draft.summary}
            onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />

          <label className={`${label} mt-4 block`}>Key takeaways (one per line)</label>
          <textarea className={`${input} mt-1`} rows={4} value={draft.takeaways.join('\n')}
            onChange={(e) => setDraft({ ...draft, takeaways: e.target.value.split('\n').filter(Boolean) })} />

          <label className={`${label} mt-4 block`}>Topics (comma-separated slugs)</label>
          <input className={`${input} mt-1`} value={draft.topics.join(', ')}
            onChange={(e) => setDraft({ ...draft, topics: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} />

          <label className={`${label} mt-4 block`}>Quiz question</label>
          <input className={`${input} mt-1`} value={draft.quiz.question}
            onChange={(e) => setDraft({ ...draft, quiz: { ...draft.quiz, question: e.target.value } })} />
          <label className={`${label} mt-3 block`}>Options (one per line; correct answer #{draft.quiz.correctIndex + 1})</label>
          <textarea className={`${input} mt-1`} rows={3} value={draft.quiz.options.join('\n')}
            onChange={(e) => setDraft({ ...draft, quiz: { ...draft.quiz, options: e.target.value.split('\n').filter(Boolean) } })} />
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className={label}>Correct option #</span>
            <input type="number" min={1} max={draft.quiz.options.length}
              className="w-16 ring-1 ring-ink/10 px-2 py-1"
              value={draft.quiz.correctIndex + 1}
              onChange={(e) => setDraft({ ...draft, quiz: { ...draft.quiz, correctIndex: Math.max(0, Number(e.target.value) - 1) } })} />
          </div>
          <label className={`${label} mt-3 block`}>Answer explanation</label>
          <input className={`${input} mt-1`} value={draft.quiz.explanation}
            onChange={(e) => setDraft({ ...draft, quiz: { ...draft.quiz, explanation: e.target.value } })} />

          <div className="mt-6 flex flex-wrap gap-3">
            <button disabled={busy} onClick={() => act('save')}
              className="rounded-card ring-1 ring-ink/15 px-5 py-2.5 text-xs uppercase tracking-[0.15em] disabled:opacity-50">
              Save edits
            </button>
            {selected?.status !== 'published' && (
              <button disabled={busy} onClick={() => act('approve')}
                className="inline-flex items-center justify-center rounded-pill bg-navy px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-navy-mid disabled:opacity-50 disabled:opacity-50">
                Approve &amp; publish
              </button>
            )}
            {selected?.status !== 'rejected' && (
              <button disabled={busy} onClick={() => act('reject')}
                className="bg-terracotta px-5 py-2.5 text-xs uppercase tracking-[0.15em] text-cream disabled:opacity-50">
                Reject
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-ink2/60">Status: {selected?.status}</p>
        </div>
      )}
    </div>
  );
}
