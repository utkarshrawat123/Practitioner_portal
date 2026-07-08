import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requestLoginLink } from '@/lib/magicLink';

export const dynamic = 'force-dynamic';

const schema = z.object({ email: z.string().trim().email() });

export async function POST(req: Request): Promise<NextResponse> {
  let email = '';
  try {
    const parsed = schema.safeParse(await req.json());
    if (parsed.success) email = parsed.data.email;
  } catch {
    /* treated as unknown email */
  }
  // Identical response shape regardless of whether the email exists.
  const { devLink } = email ? await requestLoginLink(email) : { devLink: null };
  return NextResponse.json({ ok: true, devLink });
}
