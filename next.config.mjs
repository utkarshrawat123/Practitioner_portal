/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native addon — keep it external so its .node binary is
  // traced into the serverless function bundle on Vercel instead of being
  // (incorrectly) webpacked.
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
};
export default nextConfig;
