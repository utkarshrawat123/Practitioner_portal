import { NextResponse } from 'next/server';
import { findByCode, recordClick } from '@/lib/db';
import { shopifyDiscountUrl } from '@/lib/codes';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { code: string } }
): Promise<NextResponse> {
  const code = (params.code ?? '').toUpperCase();
  try {
    const practitioner = findByCode(code);
    if (practitioner) {
      try {
        recordClick(practitioner.id, code);
      } catch {
        // losing a click is acceptable; losing the customer is not
      }
      return NextResponse.redirect(shopifyDiscountUrl(code), 302);
    }
  } catch {
    // fall through to homepage
  }
  return NextResponse.redirect('https://www.wildnutrition.com/', 302);
}
