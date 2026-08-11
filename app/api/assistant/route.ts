import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { loadKnowledgeBase } from '@/lib/ai/kb';
import { screenForRisks } from '@/lib/ai/safety';
import { AssistantError, generateProtocol, isConfigured, selectProvider } from '@/lib/ai/assistant';
import { renderHandout } from '@/lib/ai/handout';
import { recordAiQuery, recentAiQueryCount } from '@/lib/db';
import { referralLink } from '@/lib/codes';

export const dynamic = 'force-dynamic';

const schema = z.object({
  profile: z.string().trim().min(10, 'Please describe the client in a bit more detail').max(2000),
});

export async function POST(req: Request): Promise<NextResponse> {
  const practitioner = await getSessionPractitioner(req);
  if (!practitioner || practitioner.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  if (!isConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  // Basic per-practitioner rate limit: 30 queries per rolling hour.
  const HOURLY_LIMIT = 30;
  const sinceSqlUtc = new Date(Date.now() - 3600_000).toISOString().slice(0, 19).replace('T', ' ');
  if ((await recentAiQueryCount(practitioner.id, sinceSqlUtc)) >= HOURLY_LIMIT) {
    return NextResponse.json(
      { error: 'You’ve reached the hourly limit for Ask the Expert. Please try again later.' },
      { status: 429 }
    );
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
  const { complete, model } = selectProvider();

  try {
    const result = await generateProtocol(profile, kb, flags, complete);
    await recordAiQuery({
      practitionerId: practitioner.id,
      profileInput: profile,
      status: result.output.status,
      safetyFlags: flags,
      output: result.output,
      groundingWarnings: result.groundingWarnings,
      model,
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
    await recordAiQuery({
      practitionerId: practitioner.id,
      profileInput: profile,
      status: 'error',
      safetyFlags: flags,
      output: { error: (err as Error).message },
      model,
    });
    const raw = (err as Error).message ?? '';
    // Provider rate-limit / quota (e.g. Gemini 429) — a capacity issue, not a bug.
    if (/\b429\b|quota|rate limit|resource_exhausted/i.test(raw)) {
      return NextResponse.json(
        { error: 'Ask the Expert has reached its usage limit for now. Please try again in a little while.' },
        { status: 429 }
      );
    }
    const message =
      err instanceof AssistantError && err.code === 'malformed_output'
        ? 'The assistant returned an unexpected response. Please try again.'
        : 'The assistant is temporarily unavailable. Please try again shortly.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
