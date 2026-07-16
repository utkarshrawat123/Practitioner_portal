import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionPractitioner } from '@/lib/practitionerAuth';
import { listLeaderboardOptins, getPractitioner, getLeaderboardOptin, setLeaderboardOptin } from '@/lib/db';
import { practitionerEngagement } from '@/lib/automation/engagement';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const me = await getSessionPractitioner(req);
  if (!me || me.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const optins = await listLeaderboardOptins();
  const rows = (await Promise.all(optins.map(async (o) => {
    const p = await getPractitioner(o.practitionerId);
    if (!p || p.status !== 'approved') return null;
    return { displayName: o.displayName || p.name.split(' ')[0], score: await practitionerEngagement(p), isMe: p.id === me.id };
  }))).filter((x): x is { displayName: string; score: number; isMe: boolean } => x !== null);
  rows.sort((a, b) => b.score - a.score);
  const mine = await getLeaderboardOptin(me.id);
  return NextResponse.json({ leaderboard: rows, optedIn: mine?.optedIn ?? false, displayName: mine?.displayName ?? null });
}

const schema = z.object({ optedIn: z.boolean(), displayName: z.string().trim().max(80).optional().nullable() });

export async function POST(req: Request): Promise<NextResponse> {
  const me = await getSessionPractitioner(req);
  if (!me || me.status !== 'approved') return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  await setLeaderboardOptin(me.id, parsed.data.optedIn, parsed.data.displayName ?? null);
  return NextResponse.json({ ok: true });
}
