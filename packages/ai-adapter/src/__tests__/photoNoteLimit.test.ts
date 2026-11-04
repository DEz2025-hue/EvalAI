import { afterEach, describe, expect, it, vi } from "vitest";
import { photoReview } from "../photoReview";
import { DraftReportInput, PHOTO_NOTE_LINES, ProposeMaterialsInput } from "../schemas";

// A photo review could write more lines than the later AI steps accepted, and every one of those steps was then refused before reaching the AI (D-043).
describe("photo notes reach every AI step that reads them", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const fullReview = async () => {
    vi.stubEnv("META_API_KEY", "k");
    const line = (n: number, what: string) => Array.from({ length: n }, (_, i) => `${what} ${i} ${"x".repeat(400)}`);
    const content = JSON.stringify({
      photos: [{ evidence_id: "e1", caption: "c".repeat(900), observations: line(14, "seen"), readings: Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, value: "v".repeat(300) })), suggestions: line(5, "try"), possible_issues: Array.from({ length: 9 }, () => ({ text: "i".repeat(600), confidence: "low", find: "wires" })), cannot_tell: line(9, "unknown") }],
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage: {} }), { status: 200, headers: { "content-type": "application/json" } })));
    const out = await photoReview({ mode: "assessment", pack: "solar", checklist: [], photos: [{ evidenceId: "e1", imageBase64: "QUJD", mimeType: "image/jpeg" }] });
    return out.photos[0];
  };
  const common = { workspaceId: "w", assessmentId: "a", siteName: "S", mode: "assessment" as const, pack: "solar" as const, checklist: [], findings: [], measurements: [], limitations: [] };

  it("holds as many lines as the limit allows, and no more", async () => {
    expect((await fullReview()).observations).toHaveLength(PHOTO_NOTE_LINES);
  });

  it("passes the report, design and plan check at its fullest", async () => {
    const p = await fullReview();
    const photos = [{ id: "e1", itemTitle: "Roof", caption: p.caption, observations: p.observations, possibleIssues: p.possibleIssues.map((x) => x.text), cannotTell: p.cannotTell }];
    expect(DraftReportInput.safeParse({ ...common, photos }).success).toBe(true);
  });

  it("passes the materials check at its fullest", async () => {
    const p = await fullReview();
    const photos = [{ id: "e1", itemTitle: "Roof", caption: p.caption, observations: p.observations, possibleIssues: p.possibleIssues.map((x) => x.text), cannotTell: p.cannotTell }];
    expect(ProposeMaterialsInput.safeParse({ ...common, photos, rules: [] }).success).toBe(true);
  });
});
