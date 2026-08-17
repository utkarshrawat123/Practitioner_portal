import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

// Makes Cloudflare bindings (D1, R2) available during `next dev`. No-op when the
// Cloudflare context isn't present, so the plain Node/Vercel dev path is
// unaffected.
initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native addon — keep it external so its .node binary is
  // traced into the serverless function bundle instead of being (incorrectly)
  // webpacked. Renamed from experimental.serverComponentsExternalPackages in
  // Next 15.
  serverExternalPackages: ['better-sqlite3'],
};
export default nextConfig;
