import { describe, it, expect, vi, beforeEach } from "vitest";
import { AiAdapterError } from "@eval-ai/ai-adapter";

const siteIntake = vi.fn();
vi.mock("@eval-ai/ai-adapter", async (orig) => {
  const real = await orig<typeof import("@eval-ai/ai-adapter")>();
  return { ...real, siteIntake: (...a: unknown[]) => siteIntake(...a) };
});
vi.mock("../auth", () => ({ requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }) }));
const loadFacts = vi.fn();
vi.mock("../aiRoute", async (orig) => {
  const real = await orig<typeof import("../aiRoute")>();
  return { ...real, aiGuard: async () => null, loadAssessmentFacts: (...a: unknown[]) => loadFacts(...a) };
});

import { POST } from "../../app/api/ai/site-intake/route";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const call = (body: unknown) => POST(new Request("http://x/api/ai/site-intake", { method: "POST", body: JSON.stringify(body) }));
const ok = { startHere: { itemId: A, title: "Inverter", reason: "Start here" }, newItems: [], guidanceUpdates: [], visible: [], limitations: [], uncertainty: "low", requiresHumanReview: true };
const img = { imageBase64: "QUJD", mimeType: "image/jpeg" };

beforeEach(() => {
  siteIntake.mockReset();
  loadFacts.mockReset();
  loadFacts.mockResolvedValue({
    assessment: { mode: "assessment", pack: "solar", context: {} },
    scenario: "new_install",
    items: [{ id: A, title: "Inverter", instructions: "Photograph the label.", required: true }],
    responses: [],
    evidenceIds: ["ev-1", "ev-2"],
  });
});

describe("POST /api/ai/site-intake", () => {
  it("builds the checklist and situation from stored facts, not from the phone, and labels the answer a suggestion", async () => {
    siteIntake.mockResolvedValue(ok);
    const res = await call({ assessmentId: "job-1", description: "Tin roof", images: [img], evidenceIds: ["ev-1"], scenario: "existing", checklist: [{ id: "fake", title: "Fake" }] });
    expect(res.status).toBe(200);
    expect(loadFacts).toHaveBeenCalledWith({}, "job-1");
    const sent = siteIntake.mock.calls[0][0];
    expect(sent).toMatchObject({ mode: "assessment", pack: "solar", scenario: "new_install", description: "Tin roof" });
    expect(sent.checklist).toEqual([{ id: A, title: "Inverter", lookFor: "Photograph the label." }]);
    expect(sent.images).toHaveLength(1);
    const data = (await res.json()) as { label: string; requiresHumanReview: boolean; evidenceIds: string[] };
    expect(data.label).toMatch(/needs your review/);
    expect(data.requiresHumanReview).toBe(true);
  });

  it("echoes back only evidence ids that belong to this job", async () => {
    siteIntake.mockResolvedValue(ok);
    const res = await call({ assessmentId: "job-1", description: "x", evidenceIds: ["ev-1", "someone-elses", "ev-2"] });
    expect(((await res.json()) as { evidenceIds: string[] }).evidenceIds).toEqual(["ev-1", "ev-2"]);
  });

  it("works from a description alone or photos alone, but not from nothing", async () => {
    siteIntake.mockResolvedValue(ok);
    expect((await call({ assessmentId: "job-1", description: "A school" })).status).toBe(200);
    expect((await call({ assessmentId: "job-1", images: [img] })).status).toBe(200);
    expect((await call({ assessmentId: "job-1", description: "  " })).status).toBe(400);
  });

  it("refuses more than twenty photos or other image types", async () => {
    expect((await call({ assessmentId: "job-1", images: Array.from({ length: 21 }, () => img) })).status).toBe(400);
    expect((await call({ assessmentId: "job-1", images: [{ imageBase64: "QUJD", mimeType: "image/gif" }] })).status).toBe(400);
    expect(siteIntake).not.toHaveBeenCalled();
  });

  it("maps provider trouble to a safe message without leaking details", async () => {
    siteIntake.mockRejectedValue(new AiAdapterError("billing", "billing", 402, "billing_not_configured"));
    const res = await call({ assessmentId: "job-1", description: "x" });
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/billing_not_configured|team_id/);
  });

  it("does not store or write anything", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../../app/api/ai/site-intake/route.ts"), "utf8") as string;
    expect(src).not.toMatch(/uploadEvidence|storage\.from|\.insert\(|\.update\(|writeFile|replaceChecklist/);
  });
});
