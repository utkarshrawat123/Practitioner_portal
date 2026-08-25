'use client';

import { useEffect, useRef, useState } from 'react';

interface ProtocolItem {
  product: string; dose: string; rationale: string; evidence_notes: string; sources: string[];
}
interface Output {
  status: 'ok' | 'out_of_scope';
  out_of_scope_reason: string;
  safety_flags: { type: string; detail: string; recommendation: string }[];
  protocol: ProtocolItem[];
  sources_reviewed: string[];
  general_notes: string;
}
interface Result { output: Output; groundingWarnings: string[]; handoutHtml: string | null }

const card = 'rounded-card bg-white shadow-card p-6';
const label = 'text-xs uppercase tracking-[0.15em] text-ink2/70';

export default function AssistantApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [profile, setProfile] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/me');
      setAuthed(res.ok);
    })();
  }, []);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotConfigured(false);
    setResult(null);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      const body = await res.json();
      if (res.status === 503) setNotConfigured(true);
      else if (!res.ok) setError(body.error ?? 'Something went wrong.');
      else setResult(body);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  function printHandout() {
    iframeRef.current?.contentWindow?.print();
  }

  if (authed === false) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="font-heading text-3xl text-ink">Ask the Expert</h1>
        <p className="mt-4 text-ink2/80">
          This tool is available to approved practitioners. Please{' '}
          <a href="/dashboard" className="text-terracotta underline">log in to your dashboard</a>{' '}
          first.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <p className={label}>Practitioner tools</p>
      <h1 className="mt-1 font-heading text-3xl text-ink md:text-4xl">Ask the Expert</h1>
      <p className="mt-3 max-w-2xl text-sm text-ink2/80">
        Your AI protocol assistant, trained on Wild Nutrition&apos;s practitioner knowledge base.
        Describe your client in plain language and it suggests a Wild Nutrition protocol —
        grounded only in our dossiers — plus a printable client handout with your referral code.
        Suggestions are for your clinical review; they are not advice.
      </p>

      <form onSubmit={generate} className={`${card} mt-8`}>
        <label htmlFor="profile" className={label}>Client profile</label>
        <textarea
          id="profile" value={profile} onChange={(e) => setProfile(e.target.value)}
          required minLength={10} maxLength={2000} rows={4}
          className="mt-1.5 w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[15px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50"
          placeholder='e.g. "35F, perimenopausal, low ferritin, insomnia, vegetarian"'
        />
        <button
          type="submit" disabled={busy || authed === null}
          className="mt-4 inline-flex items-center justify-center rounded-pill bg-navy px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-navy-mid disabled:opacity-50 disabled:opacity-50"
        >
          {busy ? 'Generating…' : 'Generate protocol'}
        </button>
      </form>

      {notConfigured && (
        <div className={`${card} mt-6 border-terracotta`}>
          <p className="font-heading text-xl text-ink">Ask the Expert isn&apos;t configured yet</p>
          <p className="mt-2 text-sm text-ink2/80">
            An AI API key hasn&apos;t been added. Add <code>GEMINI_API_KEY</code> to the
            server environment and redeploy — no other setup is needed.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-6 border border-terracotta bg-cream px-4 py-3 text-sm text-terracotta">{error}</p>
      )}

      {result && result.output.status === 'out_of_scope' && (
        <div className={`${card} mt-6`}>
          <p className="font-heading text-xl text-ink">Outside the assistant&apos;s scope</p>
          <p className="mt-2 text-sm text-ink2/80">{result.output.out_of_scope_reason}</p>
        </div>
      )}

      {result && result.output.status === 'ok' && (
        <div className="mt-6 space-y-6">
          {result.output.safety_flags.length > 0 && (
            <div className="border-l-4 border-terracotta bg-cream p-5">
              <p className="font-heading text-lg text-terracotta">Safety flags — review before use</p>
              <ul className="mt-2 space-y-2 text-sm text-ink2/90">
                {result.output.safety_flags.map((f, i) => (
                  <li key={i}>
                    <span className="font-semibold">{f.type}:</span> {f.detail}
                    <br /><span className="text-ink2/70">{f.recommendation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.groundingWarnings.length > 0 && (
            <p className="rounded-card bg-blush px-4 py-3 text-[13px] text-ink2/70">
              {result.groundingWarnings.join(' ')}
            </p>
          )}

          <div className={card}>
            <p className={label}>Suggested protocol</p>
            <div className="mt-4 space-y-5">
              {result.output.protocol.map((item, i) => (
                <div key={i} className="border-b border-ink/8 pb-4 last:border-0 last:pb-0">
                  <p className="font-heading text-xl text-terracotta">{item.product}</p>
                  <p className="mt-1 text-sm font-semibold">{item.dose}</p>
                  <p className="mt-2 text-sm text-ink2/90">{item.rationale}</p>
                  <p className="mt-1 text-xs text-ink2/70">{item.evidence_notes}</p>
                  {item.sources.length > 0 && (
                    <p className="mt-1 text-xs text-terracotta">
                      {item.sources.length > 1 ? 'Sources' : 'Source'}: {item.sources.join(' · ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {result.output.general_notes && (
              <p className="mt-4 border-t border-ink/10 pt-4 text-sm text-ink2/80">
                {result.output.general_notes}
              </p>
            )}
            {result.output.sources_reviewed?.length > 0 && (
              <p className="mt-3 border-t border-ink/10 pt-3 text-xs text-ink2/60">
                <span className="uppercase tracking-[0.12em]">Resources analysed:</span>{' '}
                {result.output.sources_reviewed.join(' · ')}
              </p>
            )}
          </div>

          {result.handoutHtml && (
            <div className={card}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={label}>Client handout preview</p>
                <button
                  onClick={printHandout}
                  className="inline-flex items-center justify-center rounded-pill bg-navy px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-navy-mid disabled:opacity-50"
                >
                  Print / Save as PDF
                </button>
              </div>
              <iframe
                ref={iframeRef}
                srcDoc={result.handoutHtml}
                title="Client handout"
                className="mt-4 h-[600px] w-full rounded-card bg-white shadow-card"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
