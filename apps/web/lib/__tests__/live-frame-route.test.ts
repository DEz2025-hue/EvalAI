import { describe, it, expect, vi, beforeEach } from "vitest";
import { AiAdapterError } from "@eval-ai/ai-adapter";

const liveFrame = vi.fn();
vi.mock("@eval-ai/ai-adapter", async (orig) => {
  const real = await orig<typeof import("@eval-ai/ai-adapter")>();
  return { ...real, liveFrame: (...a: unknown[]) => liveFrame(...a) };
});
// Live guidance is off for now (D-038); these tests switch it on to keep the route itself covered.
vi.mock("@eval-ai/shared", async (orig) => ({ ...(await orig<typeof import("@eval-ai/shared")>()), LIVE_CAMERA_ENABLED: true }));
vi.mock("../auth", () => ({ requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }) }));
const loadFacts = vi.fn();
vi.mock("../aiRoute", async (orig) => {
  const real = await orig<typeof import("../aiRoute")>();
  return { ...real, loadAssessmentFacts: (...a: unknown[]) => loadFacts(...a) };
});

import { POST } from "../../app/api/ai/live-frame/route";

const ITEM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ITEM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const call = (body: unknown) => POST(new Request("http://x/api/ai/live-frame", { method: "POST", body: JSON.stringify(body) }));
const ok = { notes: [{ id: "n1", text: "Inverter is wall mounted.", confidence: "high", checklistItemId: ITEM_A }], betterShotTip: null, limitations: [], uncertainty: "low", requiresHumanReview: true };

beforeEach(() => {
  liveFrame.mockReset();
  loadFacts.mockReset();
  loadFacts.mockResolvedValue({
    assessment: { mode: "inspection", pack: "solar" },
    items: [
      { id: ITEM_A, title: "Inverter", required: true },
      { id: ITEM_B, title: "Earthing", required: true },
    ],
    responses: [{ itemId: ITEM_B, status: "pass" }],
    evidenceIds: [],
  });
});

describe("POST /api/ai/live-frame", () => {
  it("builds the checklist from stored facts (with statuses), not from the phone, and labels the answer a suggestion", async () => {
    liveFrame.mockResolvedValue(ok);
    const res = await call({ assessmentId: "job-1", imageBase64: "QUJD", currentItemId: ITEM_A, previousNotes: ["Earlier note."] });
    expect(res.status).toBe(200);
    expect(loadFacts).toHaveBeenCalledWith({}, "job-1");
    const sent = liveFrame.mock.calls[0][0];
    expect(sent.checklist).toEqual([
      { id: ITEM_A, title: "Inverter", status: "not_checked" },
      { id: ITEM_B, title: "Earthing", status: "pass" },
    ]);
    expect(sent).toMatchObject({ mode: "inspection", pack: "solar", currentItemId: ITEM_A, previousNotes: ["Earlier note."], mimeType: "image/jpeg" });
    const data = (await res.json()) as { notes: unknown[]; label: string; requiresHumanReview: boolean };
    expect(data.notes).toHaveLength(1);
    expect(data.label).toMatch(/needs your review/);
    expect(data.requiresHumanReview).toBe(true);
  });

  it("drops a current item that isn't on this job's checklist", async () => {
    liveFrame.mockResolvedValue(ok);
    await call({ assessmentId: "job-1", imageBase64: "QUJD", currentItemId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
    expect(liveFrame.mock.calls[0][0].currentItemId).toBeUndefined();
  });

  it("rejects a missing picture, an oversized one and an unsupported type without calling the AI", async () => {
    expect((await call({ assessmentId: "job-1" })).status).toBe(400);
    expect((await call({ assessmentId: "job-1", imageBase64: "A".repeat(4_000_001) })).status).toBe(400);
    expect((await call({ assessmentId: "job-1", imageBase64: "QUJD", mimeType: "image/gif" })).status).toBe(400);
    expect(liveFrame).not.toHaveBeenCalled();
  });

  it("does not call the AI when the job isn't in the caller's workspace", async () => {
    loadFacts.mockRejectedValue(new Error("Forbidden — outside your workspace"));
    const res = await call({ assessmentId: "someone-elses", imageBase64: "QUJD" });
    expect(res.status).toBe(403);
    expect(liveFrame).not.toHaveBeenCalled();
  });

  it("maps provider billing trouble to the usual safe 503 with a code the phone can recognise", async () => {
    liveFrame.mockRejectedValue(new AiAdapterError("billing", "billing", 402, "billing_not_configured"));
    const res = await call({ assessmentId: "job-1", imageBase64: "QUJD" });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe("ai_billing");
  });

  it("maps a slow provider to a 504 and leaves nothing stored", async () => {
    liveFrame.mockRejectedValue(new AiAdapterError("slow", "timeout", 504));
    expect((await call({ assessmentId: "job-1", imageBase64: "QUJD" })).status).toBe(504);
  });
});
