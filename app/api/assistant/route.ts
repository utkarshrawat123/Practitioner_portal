import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { loadKnowledgeBase } from '@/lib/ai/kb';
import { screenForRisks } from '@/lib/ai/safety';
import { AssistantError, generateProtocol, isConfigured, MODEL } from '@/lib/ai/assistant';
import { renderHandout } from '@/lib/ai/handout';
import { recordAiQuery } from '@/lib/db';
import { referralLink } from '@/lib/codes';

export const dynamic = 'force-dynamic';

const schema = z.object({
  profile: z.string().trim().min(10, 'Please describe the client in a bit more detail').max(2000),
});

export async function POST(req: Request): Promise<NextResponse> {
  const practitioner = getSessionPractitioner(req);
  if (!practitioner || practitioner.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  if (!isConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  let profile = '';
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join('. ') },
        { status: 400 }
      );
    }
    profile = parsed.data.profile;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const flags = screenForRisks(profile);
  const kb = loadKnowledgeBase();

  try {
    const result = await generateProtocol(profile, kb, flags);
    recordAiQuery({
      practitionerId: practitioner.id,
      profileInput: profile,
      status: result.output.status,
      safetyFlags: flags,
      output: result.output,
      groundingWarnings: result.groundingWarnings,
      model: MODEL,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    });
    const handoutHtml =
      result.output.status === 'ok'
        ? renderHandout({
            practitionerName: practitioner.name,
            code: practitioner.affiliateCode ?? '',
            link: practitioner.affiliateCode ? referralLink(practitioner.affiliateCode) : '',
            output: result.output,
          })
        : null;
    return NextResponse.json({
      output: result.output,
      groundingWarnings: result.groundingWarnings,
      handoutHtml,
    });
  } catch (err) {
    recordAiQuery({
      practitionerId: practitioner.id,
      profileInput: profile,
      status: 'error',
      safetyFlags: flags,
      output: { error: (err as Error).message },
      model: MODEL,
    });
    const message =
      err instanceof AssistantError && err.code === 'malformed_output'
        ? 'The assistant returned an unexpected response. Please try again.'
        : 'The assistant is temporarily unavailable. Please try again shortly.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
