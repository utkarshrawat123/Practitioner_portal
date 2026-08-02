'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ClipboardList, BookOpen, Image as ImageIcon, Route, Briefcase, LayoutDashboard,
  Sparkles, Lightbulb, Calendar, Users, CalendarDays, MessageSquare, Bot, BarChart3,
  Zap, ChevronLeft,
} from 'lucide-react';
import AdminAiQueries from '@/components/AdminAiQueries';
import AdminChat from '@/components/AdminChat';
import AdminLessons from '@/components/AdminLessons';
import AdminReporting from '@/components/AdminReporting';
import AdminMedia from '@/components/AdminMedia';
import AdminWidgets from '@/components/AdminWidgets';
import AdminPathways from '@/components/AdminPathways';
import AdminEvents from '@/components/AdminEvents';
import AdminCommunity from '@/components/AdminCommunity';
import AdminAutomation from '@/components/AdminAutomation';
import AdminToolkit from '@/components/AdminToolkit';
import AdminFactory from '@/components/AdminFactory';
import AdminCalendar from '@/components/AdminCalendar';
import AdminPearls from '@/components/AdminPearls';

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
  certificationUrl: string | null; certificationFilename: string | null;
  certificationUploadedAt: string | null;
}
interface EventRow { id: number; type: string; detail: string; createdAt: string }

interface SectionCard { id: string; label: string; desc: string; Icon: LucideIcon }
// The admin home: sections grouped into cards. `applications` opens the review
// table (with Flagged/Approved/Rejected/All filters inside); every other id maps
// to a section component in the switch below.
const GROUPS: { title: string; cards: SectionCard[] }[] = [
  { title: 'Applications', cards: [
    { id: 'applications', label: 'Applications', desc: 'Review and decide', Icon: ClipboardList },
  ] },
  { title: 'Content', cards: [
    { id: 'lessons', label: 'Lessons', desc: 'Education library', Icon: BookOpen },
    { id: 'media', label: 'Media', desc: 'Uploads and links', Icon: ImageIcon },
    { id: 'pathways', label: 'Pathways', desc: 'Courses and modules', Icon: Route },
    { id: 'toolkit', label: 'Toolkit', desc: 'Clinical resources', Icon: Briefcase },
    { id: 'homepage', label: 'Homepage', desc: "What's-new cards", Icon: LayoutDashboard },
    { id: 'factory', label: 'Factory', desc: 'AI content drafts', Icon: Sparkles },
    { id: 'pearls', label: 'Pearls', desc: 'Clinical pearls', Icon: Lightbulb },
    { id: 'calendar', label: 'Calendar', desc: 'Content schedule', Icon: Calendar },
  ] },
  { title: 'Community and events', cards: [
    { id: 'community', label: 'Community', desc: 'Posts and replies', Icon: Users },
    { id: 'events', label: 'Events', desc: 'Webinars and meetups', Icon: CalendarDays },
  ] },
  { title: 'Communication', cards: [
    { id: 'chat', label: 'Live Chat', desc: 'Practitioner support', Icon: MessageSquare },
  ] },
  { title: 'Insights and ops', cards: [
    { id: 'ai', label: 'AI queries', desc: 'Ask-the-Expert log', Icon: Bot },
    { id: 'reporting', label: 'Reporting', desc: 'Revenue and stats', Icon: BarChart3 },
    { id: 'automation', label: 'Automation', desc: 'Scheduled jobs', Icon: Zap },
  ] },
];

// Sections that fetch their own data — for these `load` only revalidates the session.
const SELF_LOADING = ['ai', 'lessons', 'reporting', 'media', 'homepage', 'pathways', 'toolkit', 'events', 'community', 'automation', 'factory', 'calendar', 'pearls', 'chat'];

const APP_FILTERS: { id: string; label: string }[] = [
  { id: 'flagged', label: 'Flagged' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: '', label: 'All' },
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
  // `section` = which card is open; null = the card home. `tab` = the applications filter.
  const [section, setSection] = useState<string | null>(null);
  const [tab, setTab] = useState('flagged');
  const [rows, setRows] = useState<Practitioner[]>([]);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [selected, setSelected] = useState<Practitioner | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [busy, setBusy] = useState(false);
  // Live-chat capture popup: poll unread from any section; toast on a new message.
  const [chatUnread, setChatUnread] = useState(0);
  const [chatToast, setChatToast] = useState(false);
  const prevUnreadRef = useRef(0);

  const load = useCallback(async (currentSection: string | null, currentTab: string) => {
    if (currentSection && SELF_LOADING.includes(currentSection)) {
      // These sections load their own data; just confirm the session is valid.
      const res = await fetch('/api/admin/practitioners');
      setAuthed(res.status !== 401);
      return;
    }
    // Home or the Applications section: load the review list (filtered by tab).
    const res = await fetch(`/api/admin/practitioners${currentTab ? `?status=${currentTab}` : ''}`);
    if (res.status === 401) { setAuthed(false); return; }
    setAuthed(true);
    setRows((await res.json()).practitioners);
  }, []);

  useEffect(() => { load(section, tab); }, [section, tab, load]);

  // Keep the Flagged count badge fresh: refetch when authed and whenever the
  // section changes (e.g. returning home after approving someone).
  useEffect(() => {
    if (authed !== true) return;
    let alive = true;
    fetch('/api/admin/practitioners?status=flagged')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setFlaggedCount(d.practitioners.length); })
      .catch(() => {});
    return () => { alive = false; };
  }, [authed, section]);

  // Global live-chat poller — runs in any section while authed. Raises a toast the
  // moment a new unread practitioner message arrives, so support is never missed.
  useEffect(() => {
    if (authed !== true) return;
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch('/api/admin/chat?unread=1', { cache: 'no-store' });
        if (!alive || !res.ok) return;
        const { unread } = await res.json();
        setChatUnread(unread);
        if (unread > prevUnreadRef.current && section !== 'chat') setChatToast(true);
        prevUnreadRef.current = unread;
      } catch { /* transient — next tick retries */ }
    };
    check();
    const t = setInterval(check, 2500);
    return () => { alive = false; clearInterval(t); };
  }, [authed, section]);

  // Opening the Live Chat section dismisses the toast.
  useEffect(() => { if (section === 'chat') setChatToast(false); }, [section]);

  // The header logo (AdminLogoLink) fires this to return to the card home.
  useEffect(() => {
    const home = () => { setSection(null); setSelected(null); };
    window.addEventListener('admin:home', home);
    return () => window.removeEventListener('admin:home', home);
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) { setAuthed(true); load(section, tab); }
    else setLoginError('Incorrect password');
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    setAuthed(false);
    setPassword('');
    setSelected(null);
  }

  function openSection(id: string) { setSection(id); setSelected(null); }
  function goHome() { setSection(null); setSelected(null); }

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
      load(section, tab);
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
      {chatToast && (
        <button
          onClick={() => { openSection('chat'); setChatToast(false); }}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-stone bg-forest px-5 py-4 text-left text-cream shadow-2xl"
        >
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-terracotta opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-terracotta" />
          </span>
          <span>
            <span className="block text-sm font-medium">New live-chat message</span>
            <span className="block text-xs opacity-80">
              {chatUnread} unread — click to open Live Chat
            </span>
          </span>
        </button>
      )}

      <div className="mb-6 flex items-center justify-between">
        {section === null ? (
          <span />
        ) : (
          <button
            onClick={goHome}
            className="flex items-center gap-1 text-xs uppercase tracking-[0.15em] text-ink2 transition-colors hover:text-terracotta"
          >
            <ChevronLeft size={14} /> All sections
          </button>
        )}
        <button
          onClick={logout}
          className="whitespace-nowrap text-xs uppercase tracking-[0.2em] text-ink2 transition-colors hover:text-terracotta"
        >
          Log out
        </button>
      </div>

      {section === null ? (
        <div className="space-y-8">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-3 text-xs uppercase tracking-[0.15em] text-forest">{g.title}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {g.cards.map(({ id, label, desc, Icon }) => {
                  const badge = id === 'applications' ? flaggedCount : id === 'chat' ? chatUnread : 0;
                  return (
                    <button
                      key={id}
                      onClick={() => openSection(id)}
                      className="group relative flex flex-col items-start rounded-xl border border-stone bg-white p-4 text-left transition-colors hover:border-terracotta"
                    >
                      {badge > 0 && (
                        <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-terracotta px-1.5 text-[11px] font-semibold text-cream">
                          {badge}
                        </span>
                      )}
                      <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg bg-terracotta/10 text-terracotta">
                        <Icon size={18} />
                      </span>
                      <span className="text-sm font-medium text-ink">{label}</span>
                      <span className="mt-0.5 text-xs text-ink2/60">{desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : section === 'ai' ? (
        <AdminAiQueries />
      ) : section === 'lessons' ? (
        <AdminLessons />
      ) : section === 'reporting' ? (
        <AdminReporting />
      ) : section === 'media' ? (
        <AdminMedia />
      ) : section === 'homepage' ? (
        <AdminWidgets />
      ) : section === 'pathways' ? (
        <AdminPathways />
      ) : section === 'toolkit' ? (
        <AdminToolkit />
      ) : section === 'events' ? (
        <AdminEvents />
      ) : section === 'community' ? (
        <AdminCommunity />
      ) : section === 'automation' ? (
        <AdminAutomation />
      ) : section === 'factory' ? (
        <AdminFactory />
      ) : section === 'calendar' ? (
        <AdminCalendar />
      ) : section === 'pearls' ? (
        <AdminPearls />
      ) : section === 'chat' ? (
        <AdminChat />
      ) : (
        <>
          <div className="mb-4 flex gap-2 text-xs uppercase tracking-[0.15em]">
            {APP_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => { setTab(f.id); setSelected(null); }}
                className={`px-3 py-1.5 ${tab === f.id ? 'bg-forest text-cream' : 'bg-stone/40 text-ink2'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className={`grid gap-8 ${selected ? 'xl:grid-cols-[2fr_1fr]' : 'grid-cols-1'}`}>
            <div className="min-w-0 overflow-x-auto">
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
            </div>

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
                {selected.qualificationStatus === 'student' && (
                  <div className="mt-4 border border-sage bg-cream p-4 text-sm">
                    <p className="font-semibold">Student certification</p>
                    {selected.certificationUrl ? (
                      <>
                        <a
                          href={selected.certificationUrl}
                          target="_blank" rel="noreferrer"
                          className="mt-1 inline-block text-terracotta underline"
                        >
                          Open certification{selected.certificationFilename ? ` (${selected.certificationFilename})` : ''} →
                        </a>
                        {selected.certificationUploadedAt && (
                          <p className="mt-1 text-xs text-ink2/60">Uploaded {selected.certificationUploadedAt}</p>
                        )}
                      </>
                    ) : (
                      <p className="mt-1 text-ink2/70">
                        Not yet uploaded — the student has been emailed a secure upload link.
                      </p>
                    )}
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
        </>
      )}
    </div>
  );
}
