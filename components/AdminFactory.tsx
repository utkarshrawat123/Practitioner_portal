'use client';

import { useState } from 'react';

const label = 'text-xs uppercase tracking-[0.15em] text-ink2/70';
const input = 'mt-1 w-full border border-stone px-3 py-2 focus:border-terracotta focus:outline-none';

interface Created {
  lesson: { id: number; status: string };
  toolkit: { id: number; published: boolean };
  pearl: { id: number; status: string };
  socialClips: string[];
}

export default function AdminFactory() {
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Created | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setCreated(null);
    try {
      const res = await fetch('/api/admin/factory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, transcript }),
      });
      const body = await res.json();
      if (res.status === 503) setError('The Content Factory needs a Gemini API key configured on the server.');
      else if (!res.ok) setError(body.error ?? 'Something went wrong.');
      else setCreated(body.created);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 max-w-3xl">
      <p className="text-sm text-ink2/80">
        Paste a webinar transcript and the Content Factory drafts a linked set of assets —
        a lesson (summary, crib-sheet, quiz), a patient handout, a clinical pearl and social clips.
        Everything lands as a <strong>draft for your review</strong>; nothing is published automatically.
      </p>

      <form onSubmit={run} className="mt-6 grid gap-4 border border-stone bg-white p-6">
        <label className="block"><span className={label}>Webinar title</span>
          <input className={input} required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Supporting perimenopausal sleep" /></label>
        <label className="block"><span className={label}>Transcript</span>
          <textarea className={input} rows={10} required value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste the webinar transcript here…" /></label>
        {error && <p className="text-sm text-terracotta">{error}</p>}
        <button disabled={busy} className="bg-ink px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta disabled:opacity-60">
          {busy ? 'Drafting assets…' : 'Generate draft assets'}
        </button>
      </form>

      {created && (
        <div className="mt-6 border border-forest bg-cream p-5">
          <p className="font-heading text-lg text-forest">Draft assets created 🎉</p>
          <ul className="mt-3 space-y-1 text-sm text-ink2/80">
            <li>• <strong>Lesson</strong> #{created.lesson.id} — review in the <strong>Lessons</strong> tab (status: {created.lesson.status})</li>
            <li>• <strong>Patient handout</strong> #{created.toolkit.id} — review in the <strong>Toolkit</strong> tab (hidden until published)</li>
            <li>• <strong>Clinical pearl</strong> #{created.pearl.id} — review in the <strong>Pearls</strong> tab (status: {created.pearl.status})</li>
          </ul>
          {created.socialClips.length > 0 && (
            <div className="mt-3">
              <p className={label}>Social clip ideas</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-ink2/80">
                {created.socialClips.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
          <p className="mt-3 text-xs text-ink2/60">Nothing above is live — approve each item in its own tab to publish.</p>
        </div>
      )}
    </div>
  );
}
