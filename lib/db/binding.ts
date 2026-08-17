import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

interface CfEnv {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  [k: string]: unknown;
}

/**
 * Returns the Cloudflare request context's env, or null when not running on
 * Workers (local `next dev`, Vitest, or any plain Node runtime). Never throws.
 *
 * `@opennextjs/cloudflare` is imported lazily and behind try/catch so that Node
 * builds and tests — where the package's Worker-only context is absent — simply
 * get null instead of an error.
 */
function cfEnv(): CfEnv | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@opennextjs/cloudflare');
    const ctx = mod?.getCloudflareContext?.();
    return (ctx?.env as CfEnv) ?? null;
  } catch {
    return null;
  }
}

/**
 * True when executing inside the Cloudflare Workers runtime. workerd sets
 * navigator.userAgent to exactly "Cloudflare-Workers"; Node sets its own value,
 * so this is false in dev, tests and any plain Node runtime.
 *
 * Used to tell "no D1 binding because we're in Node" (fine — use a file DB)
 * apart from "no D1 binding on Workers" (a misconfiguration that must fail loudly).
 */
export function isWorkersRuntime(): boolean {
  try {
    return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
  } catch {
    return false;
  }
}

export function getD1Binding(): D1Database | null {
  return cfEnv()?.DB ?? null;
}

export function getR2Binding(): R2Bucket | null {
  return cfEnv()?.BUCKET ?? null;
}
