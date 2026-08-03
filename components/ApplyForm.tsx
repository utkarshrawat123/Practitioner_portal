'use client';

import { useState } from 'react';

const REGISTERS = [
  { id: 'BANT', label: 'BANT — British Association for Nutrition and Lifestyle Medicine' },
  { id: 'CNHC', label: 'CNHC — Complementary & Natural Healthcare Council' },
  { id: 'NNA', label: 'NNA — Naturopathic Nutrition Association' },
  { id: 'ANP', label: 'ANP — Association of Naturopathic Practitioners' },
];

type Result =
  | { kind: 'approved'; code: string; link: string }
  | { kind: 'flagged'; certificationRequested: boolean }
  | { kind: 'error'; message: string }
  | null;

const inputClass =
  'w-full border border-stone bg-white px-4 py-3 text-ink2 focus:border-terracotta focus:outline-none';
const labelClass = 'mb-1.5 block text-xs uppercase tracking-[0.15em] text-ink2';

export default function ApplyForm() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result>(null);
  // Pre-fill the referral code from ?ref= (read client-side to avoid a Suspense boundary).
  const [refCode] = useState<string>(() =>
    typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('ref') ?? ''
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setResult({ kind: 'error', message: body.error ?? 'Something went wrong.' });
      } else if (body.status === 'approved') {
        setResult({ kind: 'approved', code: body.code, link: body.link });
      } else {
        setResult({ kind: 'flagged', certificationRequested: !!body.certificationRequested });
      }
    } catch {
      setResult({ kind: 'error', message: 'Network error — please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.kind === 'approved') {
    return (
      <div className="border border-sage bg-white p-8">
        <h2 className="font-heading text-3xl text-ink">Welcome to the community</h2>
        <p className="mt-4">
          Your registration was verified and your practitioner account is approved. Your unique
          referral code and link are below — they are also on their way to your inbox with your
          portal login instructions.
        </p>
        <div className="mt-6 bg-cream p-5">
          <p className={labelClass}>Your referral code</p>
          <p className="font-heading text-2xl text-terracotta">{result.code}</p>
          <p className={`${labelClass} mt-4`}>Your referral link</p>
          <p className="break-all text-sm">{result.link}</p>
        </div>
        <a
          href="/dashboard"
          className="mt-6 inline-block bg-ink px-8 py-4 text-xs uppercase tracking-[0.2em] text-cream transition-colors hover:bg-terracotta"
        >
          Go to your dashboard →
        </a>
        <p className="mt-3 text-xs text-ink2/70">
          Sign in any time with this email — we&apos;ll send you a secure one-time login link.
        </p>
      </div>
    );
  }

  if (result?.kind === 'flagged') {
    return (
      <div className="border border-sage bg-white p-8">
        <h2 className="font-heading text-3xl text-ink">Thank you — application received</h2>
        {result.certificationRequested ? (
          <p className="mt-4">
            As a student applicant, we need to see your certification before we can confirm your
            account. We&apos;ve just emailed you a secure link to upload proof of study — please
            check your inbox (and spam). Once you&apos;ve uploaded it, our practitioner team will
            review and be in touch.
          </p>
        ) : (
          <p className="mt-4">
            Our practitioner team is verifying your details with your professional register. We
            aim to be in touch within two working days with your account confirmation and
            referral code.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="border border-stone bg-white p-8">
      {result?.kind === 'error' && (
        <p className="mb-6 border border-terracotta bg-cream px-4 py-3 text-sm text-terracotta">
          {result.message}
        </p>
      )}
      <div className="space-y-5">
        <div>
          <label htmlFor="name" className={labelClass}>Full name</label>
          <input id="name" name="name" required minLength={2} className={inputClass} placeholder="As it appears on your register" />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>Email address</label>
          <input id="email" name="email" type="email" required className={inputClass} placeholder="you@practice.com" />
        </div>
        <div>
          <label htmlFor="registerBody" className={labelClass}>Professional register</label>
          <select id="registerBody" name="registerBody" required className={inputClass} defaultValue="">
            <option value="" disabled>Select your register…</option>
            {REGISTERS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="registerNumber" className={labelClass}>Register / membership number</label>
          <input id="registerNumber" name="registerNumber" required minLength={2} className={inputClass} placeholder="e.g. 12345" />
        </div>
        <div>
          <span className={labelClass}>Qualification status</span>
          <div className="mt-2 flex gap-6">
            <label className="flex items-center gap-2">
              <input type="radio" name="qualificationStatus" value="qualified" required className="accent-terracotta" />
              <span>Qualified practitioner</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="qualificationStatus" value="student" className="accent-terracotta" />
              <span>Student</span>
            </label>
          </div>
        </div>
        <div>
          <label htmlFor="referredByCode" className={labelClass}>Referred by (optional)</label>
          <input
            id="referredByCode"
            name="referredByCode"
            defaultValue={refCode}
            maxLength={30}
            className={inputClass}
            placeholder="Colleague's referral code"
          />
          <p className="mt-1 text-xs text-ink2/60">If a Wild Nutrition practitioner invited you, their code is pre-filled here.</p>
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="mt-8 w-full bg-ink px-8 py-4 text-xs uppercase tracking-[0.2em] text-cream transition-colors hover:bg-terracotta disabled:opacity-50"
      >
        {submitting ? 'Verifying…' : 'Sign up now'}
      </button>
      <p className="mt-4 text-xs text-ink2/70">
        We verify every application against your professional register. Students are reviewed
        individually by our practitioner team.
      </p>
    </form>
  );
}
