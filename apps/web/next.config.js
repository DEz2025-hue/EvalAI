/** @type {import('next').NextConfig} */
const path = require("path");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
];

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // ffmpeg converts voice recordings to WAV for speech-to-text: keep it out of the bundle but trace its binary into the function.
    serverComponentsExternalPackages: ["ffmpeg-static"],
    outputFileTracingRoot: path.join(__dirname, "../../"),
    outputFileTracingIncludes: {
      "/api/ai/transcribe": ["../../node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg*"],
    },
  },
  transpilePackages: ["@eval-ai/shared", "@eval-ai/ai-adapter", "@eval-ai/supabase"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
module.exports = nextConfig;
