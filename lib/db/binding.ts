import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

interface CfEnv {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  [k: string]: unknown;
}

/**
 * Returns the Cloudflare request context's env, or null when not running on
 * Workers (local `next dev`, Vitest, or the Node/Vercel runtime). Never throws.
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

export function getD1Binding(): D1Database | null {
  return cfEnv()?.DB ?? null;
}

export function getR2Binding(): R2Bucket | null {
  return cfEnv()?.BUCKET ?? null;
}
