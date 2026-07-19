import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { getCatalog, priceCart, createDraftOrder } from '@/lib/commerce';
import { createPatientCart, listPatientCartsForPractitioner } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  patientName: z.string().trim().min(1).max(120),
  patientEmail: z.string().trim().email().max(200).optional().or(z.literal('')),
  items: z.array(z.object({ productRef: z.string().min(1), qty: z.number().int().positive().max(99) })).min(1).max(50),
});

export async function GET(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  return NextResponse.json({ carts: await listPatientCartsForPractitioner(p.id) });
}

export async function POST(req: Request): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'A patient name and at least one item are required' }, { status: 400 });

  const catalog = await getCatalog();
  // Build line items from the CATALOG (server-trusted prices), not the client.
  const items = parsed.data.items.map((i) => {
    const product = catalog.find((c) => c.id === i.productRef);
    if (!product) return null;
    return { productRef: product.id, title: product.title, imageUrl: product.imageUrl, unitPrice: product.price, qty: i.qty };
  });
  if (items.some((i) => i === null)) return NextResponse.json({ error: 'Unknown product in cart' }, { status: 400 });
  const lineItems = items as { productRef: string; title: string; imageUrl: string; unitPrice: number; qty: number }[];

  const totals = priceCart(lineItems);
  const token = randomBytes(24).toString('hex');
  const draft = await createDraftOrder({
    token, patientName: parsed.data.patientName, patientEmail: parsed.data.patientEmail || null,
    items: lineItems, subtotal: totals.subtotal, discountAmount: totals.discountAmount, total: totals.total,
    practitionerId: p.id,
  });

  const cart = await createPatientCart({
    practitionerId: p.id, patientName: parsed.data.patientName, patientEmail: parsed.data.patientEmail || null,
    token, provider: draft.externalId === 'mock-cart' ? 'mock' : 'shopify', externalId: draft.externalId,
    payUrl: draft.payUrl, currency: 'GBP',
    subtotal: totals.subtotal, discountAmount: totals.discountAmount, total: totals.total, commissionAmount: totals.commissionAmount,
    items: lineItems,
  });
  return NextResponse.json({ cart, payUrl: draft.payUrl }, { status: 201 });
}
