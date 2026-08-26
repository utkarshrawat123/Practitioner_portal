'use client';

import { useEffect, useRef, useState } from 'react';

type Loaded =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; name: string; alreadyUploaded: boolean };

/** Token-gated certification upload for a student whose application is under review. */
export default function CertificationUpload({ token, supportEmail }: { token: string; supportEmail: string | null }) {
  const [state, setState] = useState<Loaded>({ kind: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!token) { setState({ kind: 'invalid', message: 'This link is missing its token.' }); return; }
    (async () => {
      const res = await fetch(`/api/certification?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setState({ kind: 'ready', name: d.name, alreadyUploaded: d.alreadyUploaded });
        setDone(d.alreadyUploaded);
      } else {
        setState({ kind: 'invalid', message: (await res.json()).error ?? 'This link is invalid or has expired.' });
      }
    })();
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Please choose a file first.'); return; }
    setSubmitting(true);
    const body = new FormData();
    body.append('file', file);
    try {
      const res = await fetch(`/api/certification?token=${encodeURIComponent(token)}`, { method: 'POST', body });
      if (res.ok) setDone(true);
      else setError((await res.json()).error ?? 'Upload failed — please try again.');
    } catch {
      setError('Network error — please try again.');
    }
    setSubmitting(false);
  }

  const card = 'mx-auto mt-16 max-w-lg rounded-card bg-white shadow-card p-8';

  if (state.kind === 'loading') return <div className={card}><p className="text-ink2/70">Loading…</p></div>;

  if (state.kind === 'invalid') {
    return (
      <div className={card}>
        <h1 className="font-heading text-2xl text-ink">Link unavailable</h1>
        <p className="mt-3 text-ink2/80">{state.message}</p>
        {supportEmail && (
          <p className="mt-3 text-sm text-ink2/60">If you need a new link, contact {supportEmail}.</p>
        )}
      </div>
    );
  }

  if (done) {
    return (
      <div className={card}>
        <h1 className="font-heading text-2xl text-ink">Thank you, {state.name.split(' ')[0]}</h1>
        <p className="mt-3 text-ink2/80">
          Your certification has been received. Our practitioner team will review it and confirm your
          account by email. You can safely close this page.
        </p>
        <button
          onClick={() => { setDone(false); setError(''); }}
          className="mt-5 text-xs uppercase tracking-[0.15em] text-terracotta underline"
        >
          Upload a different file
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={card}>
      <h1 className="font-heading text-2xl text-ink">Upload your certification</h1>
      <p className="mt-3 text-ink2/80">
        Hi {state.name.split(' ')[0]} — to complete your student application, please upload proof of study:
        a course enrolment confirmation, student ID, or certificate. PDF or image, up to 10&nbsp;MB.
      </p>
      {error && <p className="mt-4 rounded-card ring-1 ring-terracotta/30 bg-cream px-4 py-3 text-sm text-terracotta">{error}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
        className="mt-5 block w-full text-sm file:mr-4 file:border-0 file:rounded-pill file:bg-navy file:px-4 file:py-2 file:text-white"
      />
      <button
        disabled={submitting}
        className="mt-6 inline-flex items-center justify-center rounded-pill bg-navy px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-navy-mid disabled:opacity-50 disabled:opacity-50"
      >
        {submitting ? 'Uploading…' : 'Submit certification'}
      </button>
    </form>
  );
}
