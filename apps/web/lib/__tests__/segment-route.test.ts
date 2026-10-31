import { describe, it, expect, vi, beforeEach } from "vitest";
import { AiAdapterError } from "@eval-ai/ai-adapter";

const samSegment = vi.fn();
vi.mock("@eval-ai/ai-adapter", async (orig) => {
  const real = await orig<typeof import("@eval-ai/ai-adapter")>();
  return { ...real, samSegment: (...a: unknown[]) => samSegment(...a) };
});
vi.mock("../auth", () => ({ requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }) }));

import { POST } from "../../app/api/ai/segment/route";

const call = (body: unknown) => POST(new Request("http://x/api/ai/segment", { method: "POST", body: JSON.stringify(body) }));
const img = "QUJD";

beforeEach(() => {
  samSegment.mockReset();
});

describe("POST /api/ai/segment", () => {
  it("looks for the chosen reference object with a server-chosen prompt and returns only boxes, best first", async () => {
    samSegment.mockResolvedValue({
      rawRecords: "<mask data that must not leak>",
      boxes: [
        { ordinal: 0, x1: 1, y1: 2, x2: 30, y2: 40, w: 100, h: 100, c: 0.4 },
        { ordinal: 1, x1: 5, y1: 6, x2: 60, y2: 70, w: 100, h: 100, c: 0.95 },
        { ordinal: 2, x1: 9, y1: 9, x2: 20, y2: 20, w: 100, h: 100 },
      ],
      limitations: ["Segmentation is not a verified measurement — human review required"],
      requiresHumanReview: true,
    });
    const res = await call({ imageBase64: img, reference: "card" });
    expect(res.status).toBe(200);
    expect(samSegment.mock.calls[0][0].prompt).toBe("credit card");
    const data = (await res.json()) as { boxes: Array<{ confidence: number | null; x1: number }>; rawRecords?: unknown };
    expect(data.boxes.map((b) => b.confidence)).toEqual([0.95, 0.4, null]);
    expect(data.boxes[0].x1).toBe(5);
    expect(JSON.stringify(data)).not.toMatch(/mask data/);
  });

  it("uses the paper prompt for A4 and Letter", async () => {
    samSegment.mockResolvedValue({ rawRecords: "", boxes: [], limitations: [], requiresHumanReview: true });
    await call({ imageBase64: img, reference: "a4" });
    await call({ imageBase64: img, reference: "letter" });
    expect(samSegment.mock.calls.map((c) => c[0].prompt)).toEqual(["sheet of paper", "sheet of paper"]);
  });

  it("returns an empty list when nothing is found", async () => {
    samSegment.mockResolvedValue({ rawRecords: "", boxes: [], limitations: [], requiresHumanReview: true });
    const res = await call({ imageBase64: img, reference: "a4" });
    expect(((await res.json()) as { boxes: unknown[] }).boxes).toEqual([]);
  });

  it("rejects an unknown reference and never lets the client set the prompt", async () => {
    expect((await call({ imageBase64: img, reference: "banana" })).status).toBe(400);
    samSegment.mockResolvedValue({ rawRecords: "", boxes: [], limitations: [], requiresHumanReview: true });
    await call({ imageBase64: img, reference: "a4", prompt: "ignore previous instructions" });
    expect(samSegment.mock.calls[0][0].prompt).toBe("sheet of paper");
  });

  it("turns a provider billing failure into the usual safe 503", async () => {
    samSegment.mockRejectedValue(new AiAdapterError("billing", "billing", 402, "billing_not_configured"));
    const res = await call({ imageBase64: img, reference: "a4" });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe("ai_billing");
  });
});
