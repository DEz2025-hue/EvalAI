/** @type {import('next').NextConfig} */
const path = require("path");

// ffmpeg converts voice recordings and shrinks report photos. Every route that runs it must name it here, or its server function can be built without it.
const FFMPEG_BINARY = ["../../node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg*"];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
];

const nextConfig = {
  // A second server (for example a check run beside the main one) can use its own build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  experimental: {
    // Keep ffmpeg out of the bundle but trace its binary into the functions that run it.
    serverComponentsExternalPackages: ["ffmpeg-static"],
    outputFileTracingRoot: path.join(__dirname, "../../"),
    outputFileTracingIncludes: {
      "/api/ai/transcribe": FFMPEG_BINARY,
      "/api/ai/report-photos": FFMPEG_BINARY,
      "/api/ai/photo-highlights": FFMPEG_BINARY,
      "/api/reports/snapshot": FFMPEG_BINARY,
    },
  },
  transpilePackages: ["@eval-ai/shared", "@eval-ai/ai-adapter", "@eval-ai/supabase"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
module.exports = nextConfig;
