'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminAiQueries from '@/components/AdminAiQueries';

interface Verification {
  reasonCode: string;
  confidence: string | null;
  detail: string;
  manualSearchUrl: string;
}
interface Practitioner {
  id: number; name: string; email: string; registerBody: string;
  registerNumber: string; qualificationStatus: string; tier: string;
  status: string; verification: Verification | null;
  affiliateCode: string | null; affiliateLink: string | null;
  pendingSync: boolean; createdAt: string;
  decidedAt: string | null; decidedBy: string | null;
}
interface EventRow { id: number; type: string; detail: string; createdAt: string }

const TABS = [
  { id: 'flagged', label: 'Flagged' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: '', label: 'All' },
  { id: 'ai', label: 'AI queries' },
];

const REASON_LABELS: Record<string, string> = {
  AUTO_MATCH: 'Auto-approved — clear register match',
  PARTIAL_MATCH: 'Partial name match — check the register',
  NO_MATCH: 'No register match found',
  DIRECTORY_UNAVAILABLE: 'Register directory unreachable',
  STUDENT_MANUAL: 'Student — manual review required',
  DUPLICATE: 'Duplicate registration details',
};

export default function AdminDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [tab, setTab] = useState('flagged');
  const [rows, setRows] = useState<Practitioner[]>([]);
  const [selected, setSelected] = useState<Practitioner | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (currentTab: string) => {
    if (currentTab === 'ai') {
      // AI tab loads its own data; just confirm the session is valid.
      const res = await fetch('/api/admin/practitioners');
      setAuthed(res.status !== 401);
      return;
    }
    const res = await fetch(`/api/admin/practitioners${currentTab ? `?status=${currentTab}` : ''}`);
    if (res.status === 401) { setAuthed(false); return; }
    setAuthed(true);
    setRows((await res.json()).practitioners);
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) { setAuthed(true); load(tab); }
    else setLoginError('Incorrect password');
  }

  async function select(p: Practitioner) {
    setSelected(p);
    const res = await fetch(`/api/admin/practitioners/${p.id}`);
    if (res.ok) setEvents((await res.json()).events);
  }

  async function act(id: number, action: 'approve' | 'reject' | 'retry-sync') {
    setBusy(true);
    const res = await fetch(`/api/admin/practitioners/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      const body = await res.json();
      setSelected(body.practitioner);
      setEvents(body.events);
      load(tab);
    }
    setBusy(false);
  }

  if (authed === false) {
    return (
      <form onSubmit={login} className="mt-10 max-w-sm border border-stone bg-white p-8">
        <label className="mb-1.5 block text-xs uppercase tracking-[0.15em]">Admin password</label>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-stone px-4 py-3 focus:border-terracotta focus:outline-none"
        />
        {loginError && <p className="mt-2 text-sm text-terracotta">{loginError}</p>}
        <button className="mt-5 w-full bg-ink px-6 py-3 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta">
          Log in
        </button>
      </form>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex gap-2 border-b border-stone">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSelected(null); }}
            className={`px-4 py-2 text-xs uppercase tracking-[0.15em] ${
              tab === t.id ? 'border-b-2 border-terracotta text-terracotta' : 'text-ink2/70'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'ai' ? (
        <AdminAiQueries />
      ) : (
      <div className="mt-6 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <table className="w-full border-collapse bg-white text-sm">
          <thead>
            <tr className="border-b border-stone text-left text-xs uppercase tracking-[0.1em] text-ink2/70">
              <th className="p-3">Name</th><th className="p-3">Register</th>
              <th className="p-3">Status</th><th className="p-3">Reason</th><th className="p-3">Applied</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                onClick={() => select(p)}
                className={`cursor-pointer border-b border-stone/60 hover:bg-cream ${
                  selected?.id === p.id ? 'bg-sage/30' : ''
                }`}
              >
                <td className="p-3">{p.name}<br /><span className="text-xs text-ink2/60">{p.email}</span></td>
                <td className="p-3">{p.registerBody} #{p.registerNumber}</td>
                <td className="p-3">
                  <span className={
                    p.status === 'approved' ? 'text-forest' :
                    p.status === 'flagged' ? 'text-terracotta' : 'text-ink2/70'
                  }>
                    {p.status}{p.pendingSync ? ' (sync pending)' : ''}
                  </span>
                </td>
                <td className="p-3 text-xs">{p.verification ? REASON_LABELS[p.verification.reasonCode] ?? p.verification.reasonCode : '—'}</td>
                <td className="p-3 text-xs">{p.createdAt}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-ink2/60">Nothing here.</td></tr>
            )}
          </tbody>
        </table>

        {selected && (
          <div className="h-fit border border-stone bg-white p-6">
            <h2 className="font-heading text-2xl text-ink">{selected.name}</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div><dt className="inline font-semibold">Email: </dt><dd className="inline">{selected.email}</dd></div>
              <div><dt className="inline font-semibold">Register: </dt><dd className="inline">{selected.registerBody} #{selected.registerNumber}</dd></div>
              <div><dt className="inline font-semibold">Status: </dt><dd className="inline">{selected.qualificationStatus} / {selected.status}</dd></div>
              {selected.affiliateCode && (
                <div><dt className="inline font-semibold">Code: </dt><dd className="inline">{selected.affiliateCode}</dd></div>
              )}
            </dl>
            {selected.verification && (
              <div className="mt-4 bg-cream p-4 text-sm">
                <p className="font-semibold">{REASON_LABELS[selected.verification.reasonCode] ?? selected.verification.reasonCode}</p>
                <p className="mt-1 text-ink2/80">{selected.verification.detail}</p>
                <a
                  href={selected.verification.manualSearchUrl}
                  target="_blank" rel="noreferrer"
                  className="mt-2 inline-block text-terracotta underline"
                >
                  Check the {selected.registerBody} register →
                </a>
              </div>
            )}
            <div className="mt-5 flex gap-3">
              {selected.status !== 'approved' && (
                <button disabled={busy} onClick={() => act(selected.id, 'approve')}
                  className="bg-forest px-5 py-2.5 text-xs uppercase tracking-[0.15em] text-cream disabled:opacity-50">
                  Approve
                </button>
              )}
              {selected.status !== 'rejected' && selected.status !== 'approved' && (
                <button disabled={busy} onClick={() => act(selected.id, 'reject')}
                  className="bg-terracotta px-5 py-2.5 text-xs uppercase tracking-[0.15em] text-cream disabled:opacity-50">
                  Reject
                </button>
              )}
              {selected.pendingSync && (
                <button disabled={busy} onClick={() => act(selected.id, 'retry-sync')}
                  className="border border-ink px-5 py-2.5 text-xs uppercase tracking-[0.15em] disabled:opacity-50">
                  Retry sync
                </button>
              )}
            </div>
            <h3 className="mt-6 text-xs uppercase tracking-[0.15em] text-ink2/70">Audit trail</h3>
            <ul className="mt-2 space-y-2 text-xs">
              {events.map((e) => (
                <li key={e.id} className="border-l-2 border-sage pl-3">
                  <span className="font-semibold">{e.type}</span> · {e.createdAt}<br />{e.detail}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
