import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { practitionerChatMessages } from '@/lib/db';
import { generateFaqConsolidation } from '@/lib/ai/chatInsights';
import { AssistantError } from '@/lib/ai/assistant';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * AI FAQ consolidation over practitioner questions in an optional window.
 * Degrades gracefully: if no AI key or the provider is rate-limited (429),
 * returns { aiAvailable: false } with a reason so the UI keeps showing stats.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: { from?: string | null; to?: string | null } = {};
  try { json = (await req.json()) ?? {}; } catch { /* empty body is fine */ }

  const msgs = await practitionerChatMessages({ from: json.from ?? null, to: json.to ?? null, limit: 500 });
  try {
    const { result, model } = await generateFaqConsolidation(msgs.map((m) => m.body));
    return NextResponse.json({ aiAvailable: true, model, ...result });
  } catch (err) {
    const reason = err instanceof AssistantError ? err.message : 'AI temporarily unavailable';
    console.error('[chat-insights] FAQ consolidation failed:', reason);
    return NextResponse.json({ aiAvailable: false, reason, faqs: [], narrative: '' });
  }
}
