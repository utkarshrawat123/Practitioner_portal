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
  | { kind: 'flagged' }
  | { kind: 'error'; message: string }
  | null;

const inputClass =
  'w-full border border-stone bg-white px-4 py-3 text-ink2 focus:border-terracotta focus:outline-none';
const labelClass = 'mb-1.5 block text-xs uppercase tracking-[0.15em] text-ink2';

export default function ApplyForm() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result>(null);

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
        setResult({ kind: 'flagged' });
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
      </div>
    );
  }

  if (result?.kind === 'flagged') {
    return (
      <div className="border border-sage bg-white p-8">
        <h2 className="font-heading text-3xl text-ink">Thank you — application received</h2>
        <p className="mt-4">
          Our practitioner team is verifying your details with your professional register. We
          aim to be in touch within two working days with your account confirmation and
          referral code.
        </p>
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
