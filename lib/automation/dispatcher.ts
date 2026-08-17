import { recordAutomationRun } from '@/lib/db';
import { recalculateTiers } from './tiering';
import { runReEngagement, runQuarterlyImpact } from './lifecycle';

/**
 * Runs the due scheduled jobs (a Cloudflare Cron Trigger fires this daily). Tiering +
 * re-engagement run every day; the quarterly impact report runs only in the
 * first days of a quarter (or when forced). Every job is idempotent and its
 * outcome is written to automation_runs. Never throws.
 */
export async function runScheduledJobs(
  now: Date = new Date(),
  opts: { includeQuarterly?: boolean } = {}
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};

  try { const r = await recalculateTiers(now); results.tiering = r; await recordAutomationRun('tiering', 'ok', JSON.stringify(r)); }
  catch (e) { results.tiering = { error: (e as Error).message }; await recordAutomationRun('tiering', 'error', (e as Error).message); }

  try { const r = await runReEngagement(now); results.re_engagement = r; await recordAutomationRun('re_engagement', 'ok', JSON.stringify(r)); }
  catch (e) { results.re_engagement = { error: (e as Error).message }; await recordAutomationRun('re_engagement', 'error', (e as Error).message); }

  const quarterStartMonth = now.getUTCMonth() % 3 === 0;
  if (opts.includeQuarterly || (quarterStartMonth && now.getUTCDate() <= 3)) {
    try { const r = await runQuarterlyImpact(now); results.quarterly = r; await recordAutomationRun('quarterly', 'ok', JSON.stringify(r)); }
    catch (e) { results.quarterly = { error: (e as Error).message }; await recordAutomationRun('quarterly', 'error', (e as Error).message); }
  }
  return results;
}
