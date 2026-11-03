import { describe, expect, it, vi } from "vitest";

const createReportSnapshotLocal = vi.fn();
vi.mock("../auth", () => ({ requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }), requireAuth: async () => ({ auth: { mode: "demo", ctx: {} } }), workspaceIdFor: () => null, storeError: (e: unknown) => { throw e; } }));
vi.mock("../store", () => ({ createReportSnapshotLocal: (...a: unknown[]) => createReportSnapshotLocal(...a), verifyAssessmentWorkspace: async () => undefined, getSnapshotLocal: vi.fn(), listSnapshotsLocal: vi.fn(), removeSnapshotPhotosLocal: vi.fn(), updateSnapshotNarrativeLocal: vi.fn() }));

import { POST, maxDuration } from "../../app/api/reports/snapshot/route";

describe("pictures in a report draft", () => {
  it("every route that shrinks pictures ships the image tool", async () => {
    const config = (await import("../../next.config.js")) as unknown as { default?: unknown; experimental?: unknown };
    const includes = ((config.default ?? config) as { experimental: { outputFileTracingIncludes: Record<string, string[]> } }).experimental.outputFileTracingIncludes;
    for (const route of ["/api/ai/transcribe", "/api/ai/report-photos", "/api/ai/photo-highlights", "/api/reports/snapshot"]) expect(includes[route]?.join()).toContain("ffmpeg-static");
    expect(maxDuration).toBe(60);
  });

  it("says how many photos have no picture, so a report without them is never a surprise", async () => {
    createReportSnapshotLocal.mockResolvedValue({ snapshot: { id: "s1" }, persisted: true, input: { photos: [{ evidenceId: "a", thumbnail: "data:image/jpeg;base64,QUJD" }, { evidenceId: "b" }, { evidenceId: "c", thumbnail: "" }] } });
    const res = await POST(new Request("http://x/api/reports/snapshot", { method: "POST", body: JSON.stringify({ assessmentId: "a1b" }) }));
    expect(res.status).toBe(200);
    expect((await res.json()).picturesMissing).toBe(2);
  });

  it("reports none when the draft has no photos", async () => {
    createReportSnapshotLocal.mockResolvedValue({ snapshot: { id: "s1" }, persisted: true, input: {} });
    const res = await POST(new Request("http://x/api/reports/snapshot", { method: "POST", body: JSON.stringify({ assessmentId: "a1b" }) }));
    expect((await res.json()).picturesMissing).toBe(0);
  });
});
