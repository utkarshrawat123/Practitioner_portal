import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

// Makes Cloudflare bindings (D1, R2) available during `next dev`. No-op when the
// Cloudflare context isn't present, so the plain Node dev path is unaffected.
initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native addon — keep it external so its .node binary is
  // traced into the serverless function bundle instead of being (incorrectly)
  // webpacked. Renamed from experimental.serverComponentsExternalPackages in
  // Next 15.
  // Node-only packages that must never be webpacked/bundled into the Cloudflare
  // Worker. On Workers these code paths are unreachable (D1 + Resend are used
  // instead); keeping them external stops esbuild from trying to resolve them at
  // bundle time.
  serverExternalPackages: [
    'better-sqlite3',
    '@libsql/client',
    '@libsql/hrana-client',
    '@libsql/isomorphic-ws',
    'nodemailer',
  ],
  // Next's output tracing follows only the `node` export condition, so files
  // reachable solely via other conditions (workerd/browser: @libsql/client
  // lib-{esm,cjs}/web.js, @libsql/hrana-client */proto.js) are never traced.
  // On Windows OpenNext materialises server-function node_modules from those
  // traces, and its esbuild pass — which DOES use the workerd condition —
  // then fails with "Could not resolve @libsql/client" (97×). Force the whole
  // family into the trace so the copy is complete. No-op where builds already
  // worked. See HANDOVER.md §10.
  outputFileTracingIncludes: {
    '*': ['./node_modules/@libsql/**/*'],
  },
};
export default nextConfig;
