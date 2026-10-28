/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  transpilePackages: ["@eval-ai/shared", "@eval-ai/ai-adapter", "@eval-ai/supabase"],
};
module.exports = nextConfig;
