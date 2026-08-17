/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native addon — keep it external so its .node binary is
  // traced into the serverless function bundle instead of being (incorrectly)
  // webpacked. Renamed from experimental.serverComponentsExternalPackages in
  // Next 15.
  serverExternalPackages: ['better-sqlite3'],
};
export default nextConfig;
