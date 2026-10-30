import { defineConfig, devices } from "@playwright/test";

// Browser E2E for the web app in demo mode (file-backed store, no Supabase, no AI key), so it is deterministic and free.
// Row-level security is covered separately by supabase/tests/rls.test.sql.
//
// Locally the system Edge is used (no browser download). CI installs Chromium and sets E2E_CHANNEL="".
// E2E_SERVER_COMMAND lets CI serve the production build instead of `next dev`.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const channel = process.env.E2E_CHANNEL ?? (process.env.CI ? "" : "msedge");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "web", use: { ...devices["Desktop Chrome"], ...(channel ? { channel } : {}) } }],
  webServer: {
    command: process.env.E2E_SERVER_COMMAND ?? `node node_modules/next/dist/bin/next dev -p ${PORT}`,
    cwd: "apps/web",
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DEMO_MODE: "1",
      // Empty values win over .env files, which forces demo mode and disables the AI provider.
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      AI_PROVIDER_API_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
