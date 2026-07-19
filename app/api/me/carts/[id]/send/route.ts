import { NextResponse } from 'next/server';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { listPatientCartsForPractitioner, markCartSent } from '@/lib/db';
import { sendSmtpEmail } from '@/lib/providers/smtp';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const p = await getSessionPractitioner(req);
  if (!p || p.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = Number(params.id);
  const cart = (await listPatientCartsForPractitioner(p.id)).find((c) => c.id === id);
  if (!cart) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!cart.patientEmail) return NextResponse.json({ error: 'This cart has no patient email' }, { status: 400 });

  const origin = new URL(req.url).origin;
  const link = `${origin}${cart.payUrl}`;
  const html = `<p>Hi ${esc(cart.patientName)},</p><p>${esc(p.name)} has prepared a Wild Nutrition order for you. You can review and pay here:</p><p><a href="${link}">${link}</a></p><p>Total: £${cart.total.toFixed(2)}</p>`;
  const result = await sendSmtpEmail({ to: cart.patientEmail, subject: `Your Wild Nutrition order from ${p.name}`, html });
  await markCartSent(cart.id);
  return NextResponse.json({ ok: true, delivered: result.ok, detail: result.detail });
}
