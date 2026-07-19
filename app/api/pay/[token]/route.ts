import { NextResponse } from 'next/server';
import { getCartByToken, markCartPaid, getPractitioner, recordOrder } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { token: string } }): Promise<NextResponse> {
  const cart = await getCartByToken(params.token);
  if (!cart) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const practitioner = await getPractitioner(cart.practitionerId);
  return NextResponse.json({
    practitionerName: practitioner?.name ?? 'Your practitioner',
    patientName: cart.patientName,
    items: (cart.items ?? []).map((i) => ({ title: i.title, imageUrl: i.imageUrl, unitPrice: i.unitPrice, qty: i.qty })),
    subtotal: cart.subtotal, discount: cart.discountAmount, total: cart.total, currency: cart.currency,
    status: cart.status,
  });
}

/** Mock payment: mark paid + attribute to the practitioner via the existing orders pipeline. */
export async function POST(_req: Request, { params }: { params: { token: string } }): Promise<NextResponse> {
  const cart = await getCartByToken(params.token);
  if (!cart) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (cart.status !== 'paid') {
    await markCartPaid(cart.id);
    const practitioner = await getPractitioner(cart.practitionerId);
    await recordOrder({
      orderId: `cart-${cart.id}`,
      practitionerId: cart.practitionerId,
      code: practitioner?.affiliateCode ?? `cart-${cart.id}`,
      total: cart.total,
      currency: cart.currency,
      financialStatus: 'paid',
      createdAt: new Date().toISOString(),
    });
  }
  return NextResponse.json({ status: 'paid', total: cart.total });
}
