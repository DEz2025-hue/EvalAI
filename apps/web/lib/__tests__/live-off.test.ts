import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { LIVE_CAMERA_ENABLED, LIVE_COMING_SOON } from "@eval-ai/shared";

// Live guidance is switched off for now and shown as coming with Meta glasses (D-038). The site interview stays.

const liveFrame = vi.fn();
vi.mock("@eval-ai/ai-adapter", async (orig) => ({ ...(await orig<typeof import("@eval-ai/ai-adapter")>()), liveFrame: (...a: unknown[]) => liveFrame(...a) }));
vi.mock("../auth", () => ({ requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }) }));

import { POST } from "../../app/api/ai/live-frame/route";
import { GET } from "../../app/api/live/status/route";

const root = path.join(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("live guidance is off for now (D-038)", () => {
  it("the flag is off and the coming-soon wording mentions Meta glasses", () => {
    expect(LIVE_CAMERA_ENABLED).toBe(false);
    expect(LIVE_COMING_SOON.title).toMatch(/Meta glasses/);
    expect(LIVE_COMING_SOON.message).toMatch(/Coming soon/);
  });

  it("the frame route refuses before any AI call", async () => {
    const res = await POST(new Request("http://x/api/ai/live-frame", { method: "POST", body: JSON.stringify({ assessmentId: "a", imageBase64: "QUJD" }) }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/coming soon/);
    expect(liveFrame).not.toHaveBeenCalled();
  });

  it("the status route says coming soon, for glasses too", async () => {
    const out = await (await GET()).json();
    expect(out).toMatchObject({ status: "coming_soon", available: false, platforms: { glasses: "coming_soon" } });
  });

  it("no screen offers live: the web job pages gate the panel, the phone job shows Site interview, both dashboards show coming soon", () => {
    for (const f of ["apps/web/app/assessments/[id]/page.tsx", "apps/web/app/inspections/[id]/page.tsx"]) expect(read(f)).toContain("{LIVE_CAMERA_ENABLED ? <LiveCameraPanel");
    expect(read("apps/mobile/app/assessments/[id].tsx")).toContain(`LIVE_CAMERA_ENABLED ? "Live session (beta)" : "Site interview"`);
    expect(read("apps/mobile/app/assessments/[id]/live.tsx")).toContain("ready && LIVE_CAMERA_ENABLED && mode === \"camera\"");
    expect(read("apps/web/app/page.tsx")).toContain("LIVE_COMING_SOON.message");
    expect(read("apps/mobile/app/(tabs)/index.tsx")).toContain("LIVE_COMING_SOON.message");
    expect(read("apps/mobile/app/(tabs)/index.tsx")).not.toContain("Live session — Beta");
  });
});
