import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/adminAuth';
import { geminiConfigured } from '@/lib/ai/assistant';
import { generateWebinarAssets } from '@/lib/ai/factory';
import { insertLesson, createToolkitResource, createClinicalPearl } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  title: z.string().trim().min(3).max(200),
  transcript: z.string().trim().min(50, 'Paste the webinar transcript (at least a few sentences).').max(60000),
});

export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  if (!geminiConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('. ') }, { status: 400 });
  }
  const { title, transcript } = parsed.data;

  let generated;
  try {
    generated = await generateWebinarAssets(title, transcript);
  } catch (err) {
    const raw = (err as Error).message ?? '';
    if (/\b429\b|quota|rate limit|resource_exhausted/i.test(raw)) {
      return NextResponse.json({ error: 'The content generator has reached its usage limit for now. Please try again later.' }, { status: 429 });
    }
    return NextResponse.json({ error: 'Could not generate assets — please try again.' }, { status: 500 });
  }

  const { assets, model, inputTokens, outputTokens } = generated;

  // Everything lands as a DRAFT for human review — nothing is auto-published.
  const lessonId = await insertLesson({
    sourceFile: `webinar:${title}`,
    title,
    summary: assets.summary,
    takeaways: assets.takeaways,
    quiz: assets.quiz,
    topics: assets.topics,
    claimFlags: [],
    model,
    inputTokens,
    outputTokens,
  });

  const handout = await createToolkitResource({
    title: `${title} — patient handout (draft)`,
    type: 'handout',
    description: 'Auto-drafted from a webinar — review before publishing.',
    audience: 'all',
    contentKind: 'text',
    body: assets.patient_handout,
    published: false,
  });

  const pearl = await createClinicalPearl({
    body: assets.clinical_pearl,
    category: 'From webinar',
    audience: 'all',
    status: 'draft',
    source: 'content-factory',
  });

  return NextResponse.json({
    created: {
      lesson: { id: lessonId, status: 'draft' },
      toolkit: { id: handout.id, published: false },
      pearl: { id: pearl.id, status: 'draft' },
      socialClips: assets.social_clips,
    },
  }, { status: 201 });
}
