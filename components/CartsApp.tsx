'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@/lib/format';

interface Product { id: string; title: string; imageUrl: string; price: number; currency: string }
interface Cart {
  id: number; patientName: string; patientEmail: string | null; status: string; currency?: string;
  subtotal: number; discountAmount: number; total: number; commissionAmount: number; payUrl: string;
}

const money = (n: number, currency?: string) => formatMoney(n, currency);

export default function CartsApp({ practitionerName }: { practitionerName: string }) {
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [patientName, setPatientName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [carts, setCarts] = useState<Cart[]>([]);
  const [created, setCreated] = useState<{ cart: Cart; link: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sentMsg, setSentMsg] = useState('');
  const [createError, setCreateError] = useState('');

  const loadCarts = useCallback(async () => {
    const r = await fetch('/api/me/carts', { cache: 'no-store' });
    if (r.ok) setCarts((await r.json()).carts);
  }, []);

  useEffect(() => {
    fetch('/api/me/catalog', { cache: 'no-store' }).then(async (r) => { if (r.ok) setCatalog((await r.json()).products); });
    loadCarts();
  }, [loadCarts]);

  const lines = catalog.map((p) => ({ p, q: qty[p.id] ?? 0 })).filter((l) => l.q > 0);
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.q, 0);
  const discount = Math.round(subtotal * 0.1 * 100) / 100;
  const total = Math.round((subtotal - discount) * 100) / 100;
  const commission = Math.round(total * 0.2 * 100) / 100;

  function setItemQty(id: string, q: number) { setQty((m) => ({ ...m, [id]: Math.max(0, q) })); }

  async function createCart() {
    if (!patientName.trim() || lines.length === 0 || busy) return;
    setBusy(true); setSentMsg(''); setCreateError('');
    const res = await fetch('/api/me/carts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientName, patientEmail: patientEmail || undefined,
        items: lines.map((l) => ({ productRef: l.p.id, qty: l.q })) }),
    });
    if (res.ok) {
      const body = await res.json();
      setCreated({ cart: body.cart, link: `${window.location.origin}${body.payUrl}` });
      setQty({}); setPatientName(''); setPatientEmail('');
      loadCarts();
    } else {
      // Surface the failure — a silent no-op here left practitioners clicking
      // "Create" with nothing happening (e.g. a 502 when the store rejects the
      // draft order, or a 400 for an unknown product).
      const body = await res.json().catch(() => ({}));
      setCreateError(body.error ?? 'Could not create the cart. Please try again.');
    }
    setBusy(false);
  }

  async function copyLink(link: string) { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }

  async function sendToPatient(cartId: number) {
    setSentMsg('');
    const res = await fetch(`/api/me/carts/${cartId}/send`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setSentMsg(res.ok ? 'Sent to patient.' : (body.error ?? 'Could not send.'));
    loadCarts();
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0">
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <input value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="Patient name"
            className="w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[15px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50" />
          <input value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} placeholder="Patient email (optional)"
            className="w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[15px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {catalog.map((p) => (
            <div key={p.id} className="flex min-w-0 items-center gap-3 rounded-card bg-white shadow-card p-3">
              <img src={p.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                <p className="text-xs text-ink2/60">{money(p.price, p.currency)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setItemQty(p.id, (qty[p.id] ?? 0) - 1)} className="h-7 w-7 rounded-full bg-blush text-ink2 transition-colors hover:bg-stone">–</button>
                <span className="w-6 text-center text-sm">{qty[p.id] ?? 0}</span>
                <button onClick={() => setItemQty(p.id, (qty[p.id] ?? 0) + 1)} className="h-7 w-7 rounded-full bg-blush text-ink2 transition-colors hover:bg-stone">+</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside className="h-fit rounded-card bg-blush p-5">
        <p className="text-xs uppercase tracking-[0.15em] text-terracotta">Cart summary</p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-ink2/70">Subtotal</dt><dd>{money(subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink2/70">Patient discount (10%)</dt><dd>−{money(discount)}</dd></div>
          <div className="flex justify-between font-medium text-ink"><dt>Total</dt><dd>{money(total)}</dd></div>
          <div className="flex justify-between border-t border-ink/10 pt-1.5 text-terracotta"><dt>You earn (20%)</dt><dd>{money(commission)}</dd></div>
        </dl>
        <button disabled={busy || !patientName.trim() || lines.length === 0} onClick={createCart}
          className="mt-4 w-full bg-terracotta px-4 py-2.5 text-xs uppercase tracking-[0.15em] text-cream disabled:opacity-50">
          Create pay link
        </button>
        {createError && <p className="mt-2 text-sm text-terracotta" role="alert">{createError}</p>}

        {created && (
          <div className="mt-4 border-t border-ink/10 pt-4">
            <p className="text-xs text-ink2/70">Pay link for {created.cart.patientName}:</p>
            <p className="mt-1 break-all text-xs text-ink">{created.link}</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => copyLink(created.link)} className="flex-1 border border-ink px-3 py-1.5 text-xs uppercase tracking-[0.15em]">{copied ? 'Copied' : 'Copy link'}</button>
              {created.cart.patientEmail && (
                <button onClick={() => sendToPatient(created.cart.id)} className="flex-1 inline-flex items-center justify-center rounded-pill bg-navy px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-navy-mid disabled:opacity-50">Send to patient</button>
              )}
            </div>
            {sentMsg && <p className="mt-2 text-xs text-terracotta">{sentMsg}</p>}
          </div>
        )}
      </aside>

      <div className="lg:col-span-2">
        <h2 className="mt-4 text-xs uppercase tracking-[0.15em] text-ink2/70">Your carts</h2>
        <div className="mt-3 divide-y divide-ink/5 overflow-hidden rounded-card bg-white shadow-card">
          {carts.length === 0 && <p className="p-4 text-sm text-ink2/60">No carts yet.</p>}
          {carts.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div><span className="font-medium text-ink">{c.patientName}</span> <span className="text-ink2/60">· {money(c.total, c.currency)}</span></div>
              <div className="flex items-center gap-4">
                <span className="text-terracotta">You earn {money(c.commissionAmount, c.currency)}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-wide ${c.status === 'paid' ? 'bg-olive text-white' : c.status === 'sent' ? 'bg-sage/50 text-ink' : 'bg-stone/50 text-ink2'}`}>{c.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
