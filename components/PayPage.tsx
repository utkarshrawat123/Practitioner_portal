'use client';

import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/format';

interface Item { title: string; imageUrl: string | null; unitPrice: number; qty: number }
interface CartView {
  practitionerName: string; patientName: string; items: Item[];
  subtotal: number; discount: number; total: number; currency: string; status: string;
}

export default function PayPage({ token }: { token: string }) {
  const [cart, setCart] = useState<CartView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    fetch(`/api/pay/${token}`, { cache: 'no-store' }).then(async (r) => {
      if (r.status === 404) { setNotFound(true); return; }
      const data = await r.json();
      setCart(data); if (data.status === 'paid') setPaid(true);
    });
  }, [token]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setPaying(true);
    const r = await fetch(`/api/pay/${token}`, { method: 'POST' });
    if (r.ok) setPaid(true);
    setPaying(false);
  }

  if (notFound) return <main className="mx-auto max-w-md px-6 py-24 text-center"><p className="text-ink2">This payment link is not valid.</p></main>;
  if (!cart) return <main className="mx-auto max-w-md px-6 py-24 text-center text-ink2/60">Loading…</main>;

  // Carts carry their own currency — never hardcode "£" on a page a patient pays on.
  const money = (n: number) => formatMoney(n, cart.currency);

  return (
    <main className="min-h-screen bg-cream">
      <header className="border-b border-stone bg-cream">
        <div className="mx-auto max-w-2xl px-6 py-5 font-heading text-2xl tracking-wide text-ink">
          Wild Nutrition<sup className="align-super text-xs">®</sup>
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-6 py-10">
        {paid ? (
          <div className="rounded-card ring-1 ring-olive/30 bg-white p-8 text-center">
            <h1 className="font-heading text-3xl text-forest">Payment successful</h1>
            <p className="mt-2 text-ink2/80">Thank you, {cart.patientName}. Your order is confirmed.</p>
          </div>
        ) : (
          <>
            <h1 className="font-heading text-3xl text-ink">Hi {cart.patientName},</h1>
            <p className="mt-1 text-ink2/80">{cart.practitionerName} has prepared this order for you.</p>

            <div className="mt-6 divide-y divide-ink/5 overflow-hidden rounded-card bg-white shadow-card">
              {cart.items.map((i, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3">
                  {i.imageUrl && <img src={i.imageUrl} alt="" className="h-14 w-14 rounded object-cover" />}
                  <div className="flex-1"><p className="text-sm font-medium text-ink">{i.title}</p><p className="text-xs text-ink2/60">Qty {i.qty}</p></div>
                  <p className="text-sm">{money(i.unitPrice * i.qty)}</p>
                </div>
              ))}
            </div>

            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink2/70">Subtotal</dt><dd>{money(cart.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink2/70">Discount</dt><dd>−{money(cart.discount)}</dd></div>
              <div className="flex justify-between text-lg font-medium text-ink"><dt>Total</dt><dd>{money(cart.total)}</dd></div>
            </dl>

            <form onSubmit={pay} className="mt-6 rounded-card bg-white shadow-card p-5">
              <p className="mb-3 rounded bg-sage/30 px-3 py-2 text-xs text-ink2">Demo checkout — no real payment is taken.</p>
              <div className="grid gap-3">
                <input required placeholder="Cardholder name" className="w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[15px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50" />
                <input required defaultValue="4242 4242 4242 4242" inputMode="numeric" className="w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[15px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50" />
                <div className="grid grid-cols-2 gap-3">
                  <input required placeholder="MM / YY" defaultValue="12 / 28" className="w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[15px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50" />
                  <input required placeholder="CVC" defaultValue="123" className="w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[15px] text-ink shadow-card outline-none ring-1 ring-ink/5 placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50" />
                </div>
              </div>
              <button disabled={paying} className="mt-4 w-full inline-flex items-center justify-center rounded-pill bg-terracotta px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-terracotta-mid disabled:opacity-50 disabled:opacity-50">
                {paying ? 'Processing…' : `Pay ${money(cart.total)}`}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
