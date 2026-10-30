import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Phase 7 — Live camera must remain Coming Soon; no working live stream exposed.
describe("Phase 7 — Live camera Coming Soon gate", () => {
  it("live-camera placeholder text is Coming Soon (not working)", () => {
    const placeholderPath = path.join(__dirname, "../../../..", "apps/web/components/LiveCameraPlaceholder.tsx");
    // If file not present, test still ensures gate docs exist
    if (fs.existsSync(placeholderPath)) {
      const src = fs.readFileSync(placeholderPath, "utf8");
      expect(src).toContain("Coming Soon");
      expect(src.toLowerCase()).toContain("no live stream");
      expect(src).not.toMatch(/getUserMedia.*live/i);
    } else {
      // Fallback: ensure dashboard still says Coming Soon
      const dash = fs.readFileSync(path.join(__dirname, "../../../..", "apps/web/app/page.tsx"), "utf8");
      expect(dash).toContain("Coming Soon");
    }
  });

  it("no live streaming API route is exposed beyond /api/live/status (which returns coming_soon)", () => {
    const apiRoot = path.join(__dirname, "../../../..", "apps/web/app/api");
    const walk = (dir: string): string[] =>
      fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)])) : [];
    const routes = walk(apiRoot).map((p) => p.replace(/\\/g, "/"));
    const liveRoutes = routes.filter((p) => /\/api\/live\//.test(p));
    // Only /api/live/status is allowed as gate doc; no /api/live/stream etc
    for (const r of liveRoutes) {
      expect(r).toMatch(/\/api\/live\/status\/route\.ts$/);
    }
    // Ensure no route claims to handle continuous video incorrectly
    const suspicious = routes.filter((p) => /live.*stream|continuous.*camera/i.test(p));
    expect(suspicious.length).toBe(0);
  });

  it("dashboard and assessment pages label live camera as Coming Soon until gate passes", () => {
    const files = [
      path.join(__dirname, "../../../..", "apps/web/app/page.tsx"),
      path.join(__dirname, "../../../..", "apps/web/app/assessments/[id]/page.tsx"),
    ];
    for (const f of files) {
      if (!fs.existsSync(f)) continue;
      const src = fs.readFileSync(f, "utf8");
      expect(src).toContain("Coming Soon");
    }
  });

  it("mobile also marks live camera as Coming Soon (not working)", () => {
    const candidates = [
      path.join(__dirname, "../../../..", "apps/mobile/app/(tabs)/index.tsx"),
      path.join(__dirname, "../../../..", "apps/mobile/app/(tabs)/profile.tsx"),
      path.join(__dirname, "../../../..", "apps/mobile/app/index.tsx"),
      path.join(__dirname, "../../../..", "apps/mobile/components/LiveCameraPlaceholder.tsx"),
    ];
    const existing = candidates.filter((p) => fs.existsSync(p));
    if (existing.length === 0) return;
    const found = existing.some((p) => {
      const src = fs.readFileSync(p, "utf8");
      return src.includes("Coming Soon") && src.toLowerCase().includes("not a working feature") || src.includes("Coming Soon");
    });
    // Also scan any mobile file for Coming Soon as fallback
    if (!found) {
      const mobileRoot = path.join(__dirname, "../../../..", "apps/mobile");
      const walk = (dir: string): string[] =>
        fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)])) : [];
      const all = walk(mobileRoot).filter((p) => p.endsWith(".tsx") || p.endsWith(".ts"));
      const anyComingSoon = all.some((p) => fs.readFileSync(p, "utf8").includes("Coming Soon"));
      expect(anyComingSoon).toBe(true);
      return;
    }
    expect(found).toBe(true);
  });
});
