'use client';

import { useEffect, useState } from 'react';

interface AiQueryRow {
  id: number;
  practitionerName: string | null;
  profileInput: string;
  status: string;
  safetyFlags: { type: string; detail: string }[];
  output: {
    status?: string;
    out_of_scope_reason?: string;
    protocol?: { product: string; dose: string; rationale: string }[];
    general_notes?: string;
  } | null;
  groundingWarnings: string[];
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
}

export default function AdminAiQueries() {
  const [rows, setRows] = useState<AiQueryRow[]>([]);
  const [selected, setSelected] = useState<AiQueryRow | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/ai-queries');
      if (res.ok) setRows((await res.json()).queries);
    })();
  }, []);

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
      <div className="min-w-0 overflow-x-auto">
      <table className="w-full border-collapse bg-white text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-[0.1em] text-ink2/70">
            <th className="p-3">Practitioner</th><th className="p-3">Profile</th>
            <th className="p-3">Status</th><th className="p-3">Flags</th><th className="p-3">When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => (
            <tr
              key={q.id}
              onClick={() => setSelected(q)}
              className={`cursor-pointer border-b border-ink/8 align-top hover:bg-cream ${
                selected?.id === q.id ? 'bg-sage/30' : ''
              }`}
            >
              <td className="p-3">{q.practitionerName ?? '—'}</td>
              <td className="max-w-[240px] truncate p-3">{q.profileInput}</td>
              <td className="p-3">
                <span className={
                  q.status === 'ok' ? 'text-terracotta' :
                  q.status === 'error' ? 'text-terracotta' : 'text-ink2/70'
                }>
                  {q.status}
                </span>
              </td>
              <td className="p-3 text-xs">
                {q.safetyFlags.length > 0 ? q.safetyFlags.map((f) => f.type).join(', ') : '—'}
              </td>
              <td className="p-3 text-xs">{q.createdAt}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="p-6 text-center text-ink2/60">No AI queries yet.</td></tr>
          )}
        </tbody>
      </table>
      </div>

      {selected && (
        <div className="h-fit rounded-card bg-white shadow-card p-6 text-sm">
          <p className="text-xs uppercase tracking-[0.15em] text-ink2/70">Query #{selected.id}</p>
          <p className="mt-2"><span className="font-semibold">Practitioner:</span> {selected.practitionerName ?? '—'}</p>
          <p className="mt-2 whitespace-pre-wrap border-l-2 border-sage bg-cream p-3">{selected.profileInput}</p>
          {selected.safetyFlags.length > 0 && (
            <div className="mt-3">
              <p className="font-semibold text-terracotta">Pre-screen flags</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {selected.safetyFlags.map((f, i) => <li key={i}>{f.type}: {f.detail}</li>)}
              </ul>
            </div>
          )}
          {selected.groundingWarnings.length > 0 && (
            <p className="mt-3 text-xs text-terracotta">{selected.groundingWarnings.join(' ')}</p>
          )}
          {selected.output?.protocol && selected.output.protocol.length > 0 && (
            <div className="mt-3">
              <p className="font-semibold">Suggested protocol</p>
              <ul className="mt-1 space-y-2 text-xs">
                {selected.output.protocol.map((item, i) => (
                  <li key={i} className="border-l-2 border-sage pl-3">
                    <span className="font-heading text-terracotta">{item.product}</span> — {item.dose}
                    <br />{item.rationale}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {selected.output?.out_of_scope_reason && (
            <p className="mt-3 text-xs">Out of scope: {selected.output.out_of_scope_reason}</p>
          )}
          <p className="mt-4 text-xs text-ink2/60">
            {selected.model ?? '—'} · {selected.inputTokens ?? '—'} in / {selected.outputTokens ?? '—'} out · {selected.createdAt}
          </p>
        </div>
      )}
    </div>
  );
}
