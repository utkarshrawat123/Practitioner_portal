import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { findByCode, recordOrder } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface ShopifyOrder {
  id?: number | string;
  admin_graphql_api_id?: string;
  discount_codes?: Array<{ code?: string }>;
  current_total_price?: string | number;
  total_price?: string | number;
  currency?: string;
  financial_status?: string;
  created_at?: string;
}

/**
 * Verifies Shopify's webhook signature: base64(HMAC-SHA256(rawBody, secret))
 * compared to the X-Shopify-Hmac-Sha256 header. Must run on the RAW body.
 */
function validSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(header));
  } catch {
    return false; // length mismatch → not equal
  }
}

// Receives orders/create + orders/paid. Maps the order's discount code to a
// practitioner's affiliate code and records it locally (idempotent by order id),
// so dashboard + reporting revenue read from real orders.
export async function POST(req: Request): Promise<NextResponse> {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get('x-shopify-hmac-sha256'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let order: ShopifyOrder;
  try {
    order = JSON.parse(raw) as ShopifyOrder;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const codes = (order.discount_codes ?? [])
    .map((d) => (d.code ?? '').trim())
    .filter(Boolean);

  // Find the first discount code that belongs to a practitioner.
  let matchedCode = '';
  let practitionerId: number | null = null;
  for (const code of codes) {
    const p = await findByCode(code);
    if (p) {
      matchedCode = code;
      practitionerId = p.id;
      break;
    }
  }

  // Not a practitioner referral — acknowledge (200) so Shopify doesn't retry.
  if (!practitionerId) return NextResponse.json({ ok: true, matched: false });

  const orderId = String(order.admin_graphql_api_id ?? order.id ?? '');
  if (!orderId) return NextResponse.json({ error: 'Order id missing' }, { status: 400 });

  await recordOrder({
    orderId,
    practitionerId,
    code: matchedCode,
    total: Number(order.current_total_price ?? order.total_price ?? 0),
    currency: String(order.currency ?? 'GBP'),
    financialStatus: order.financial_status ? String(order.financial_status) : null,
    createdAt: String(order.created_at ?? new Date().toISOString()),
  });

  return NextResponse.json({ ok: true, matched: true });
}
