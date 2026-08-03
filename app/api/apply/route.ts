import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DuplicateEmailError, processApplication } from '@/lib/pipeline';
import { sessionCookieHeader } from '@/lib/practitionerAuth';
import { clearWelcomeCookieHeader } from '@/lib/welcomeGate';

export const dynamic = 'force-dynamic';

const applySchema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name').max(100),
  email: z.string().trim().email('Please enter a valid email address'),
  registerBody: z.enum(['BANT', 'CNHC', 'NNA', 'ANP']),
  registerNumber: z.string().trim().min(2, 'Please enter your membership number').max(30),
  qualificationStatus: z.enum(['qualified', 'student']),
  referredByCode: z.string().trim().max(30).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = applySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join('. ') },
      { status: 400 }
    );
  }

  try {
    const practitioner = await processApplication(parsed.data);
    if (practitioner.status === 'approved') {
      // Log the newly approved practitioner straight in, so "Go to your dashboard"
      // shows THEM — not whatever stale session the browser might already hold.
      const res = NextResponse.json({
        status: 'approved',
        code: practitioner.affiliateCode,
        link: practitioner.affiliateLink,
      });
      res.headers.set('Set-Cookie', sessionCookieHeader(practitioner.id));
      // Fresh login → clear the welcome cookie so the takeover plays for them.
      res.headers.append('Set-Cookie', clearWelcomeCookieHeader());
      return res;
    }
    // Flagged: never leak verification internals to the applicant. Students are
    // told (only) to expect the certification-upload email — not sensitive.
    return NextResponse.json({
      status: 'flagged',
      certificationRequested: practitioner.qualificationStatus === 'student',
    });
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      return NextResponse.json(
        { error: 'An application already exists for this email address. Contact utkarshrawatofficial@gmail.com if you need help.' },
        { status: 409 }
      );
    }
    console.error('apply pipeline error', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your application. Please try again.' },
      { status: 500 }
    );
  }
}
