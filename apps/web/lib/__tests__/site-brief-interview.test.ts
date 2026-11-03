import { describe, it, expect } from "vitest";
import { buildSiteBrief } from "../store";

const assessment = (interview: unknown) => ({ id: "a1", context: { goal: "Quote an array", interview } }) as never;
const turns = [
  { id: "t1", role: "ai", text: "Where is the main board?", at: "2026-11-02T10:00:00.000Z" },
  { id: "t2", role: "person", text: "In the store room.", at: "2026-11-02T10:00:10.000Z", via: "voice" },
];

describe("the interview in the report's site brief", () => {
  it("is included once the person has reviewed it, as statements and the details they kept", () => {
    const brief = buildSiteBrief(assessment({ startedAt: "2026-11-02T10:00:00.000Z", status: "reviewed", turns, brief: [{ label: "Night use", value: "Lights and a fridge", quote: "lights and a fridge" }], openQuestions: ["Generator?"] }), undefined);
    expect(brief.interview).toEqual({ details: [{ label: "Night use", value: "Lights and a fridge" }], statements: [{ question: "Where is the main board?", answer: "In the store room." }], openQuestions: ["Generator?"] });
  });

  it("is left out while the interview is still going, or finished but not reviewed", () => {
    for (const status of ["active", "ended"]) expect(buildSiteBrief(assessment({ startedAt: "2026-11-02T10:00:00.000Z", status, turns }), undefined).interview).toBeUndefined();
  });

  it("is left out when there is none, or what is stored is not a valid interview", () => {
    expect(buildSiteBrief(assessment(undefined), undefined).interview).toBeUndefined();
    expect(buildSiteBrief(assessment({ status: "reviewed", turns: "nonsense" }), undefined).interview).toBeUndefined();
  });
});
