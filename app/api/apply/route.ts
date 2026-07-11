import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DuplicateEmailError, processApplication } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

const applySchema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name').max(100),
  email: z.string().trim().email('Please enter a valid email address'),
  registerBody: z.enum(['BANT', 'CNHC', 'NNA', 'ANP']),
  registerNumber: z.string().trim().min(2, 'Please enter your membership number').max(30),
  qualificationStatus: z.enum(['qualified', 'student']),
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
      return NextResponse.json({
        status: 'approved',
        code: practitioner.affiliateCode,
        link: practitioner.affiliateLink,
      });
    }
    // Flagged: never leak verification internals to the applicant.
    return NextResponse.json({ status: 'flagged' });
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
