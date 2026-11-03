import { describe, it, expect } from "vitest";
import { InterviewDigestInput, InterviewTurnInput, type InterviewDigest } from "../interview";
import { INTERVIEW_CASES, checkDigest } from "./fixtures/interviewCases";

// Offline: the evaluation set is well formed, and the automated checks catch the faults they are meant to catch.
// The live run (interviewEval.live.test.ts) is skipped unless asked for, because it calls the real model.

const digest = (over: Partial<InterviewDigest> = {}): InterviewDigest => ({ itemNotes: [], findingDrafts: [], briefLines: [], contradictions: [], openQuestions: ["x"], dropped: [], unverifiedFigures: [], requiresHumanReview: true, ...over });
const school = INTERVIEW_CASES[0];

describe("interview evaluation set", () => {
  it("every case is valid input for both operations, with unique ids", () => {
    expect(new Set(INTERVIEW_CASES.map((c) => c.id)).size).toBe(INTERVIEW_CASES.length);
    for (const c of INTERVIEW_CASES) {
      expect(() => InterviewDigestInput.parse({ ...c.record, turns: c.turns }), c.id).not.toThrow();
      expect(() => InterviewTurnInput.parse({ ...c.record, turns: [], questionsAsked: 0 }), c.id).not.toThrow();
    }
  });

  it("covers solar and CCTV, new and existing, and a vague conversation", () => {
    expect(INTERVIEW_CASES.some((c) => c.record.pack === "solar" && c.record.scenario === "new_install")).toBe(true);
    expect(INTERVIEW_CASES.some((c) => c.record.pack === "cctv" && c.record.scenario === "existing")).toBe(true);
    expect(INTERVIEW_CASES.some((c) => c.id === "vague-answers")).toBe(true);
  });
});

describe("interview automated checks", () => {
  it("accepts a grounded digest", () => {
    const d = digest({ itemNotes: [{ itemTitle: "Load audit — demand & operating hours", note: "Reported night loads: security lights and the kitchen fridge.", quote: "The security lights come on at night and the fridge keeps running" }] });
    expect(checkDigest(school, d).problems).toEqual([]);
  });

  it("catches a quote the person never said, an unknown item, and a verdict", () => {
    const d = digest({ itemNotes: [{ itemTitle: "Invented item", note: "The board is fine.", quote: "the board is in perfect condition" }] });
    const r = checkDigest(school, d).problems.join("\n");
    expect(r).toMatch(/not on the checklist/);
    expect(r).toMatch(/did not say/);
    expect(r).toMatch(/verdict/);
  });

  it("catches a number nobody said, and too much proposed from vague answers", () => {
    const vague = INTERVIEW_CASES[2];
    const d = digest({
      itemNotes: [{ itemTitle: "Roof / structure / mounting constraints", note: "The roof is 25 years old.", quote: "I think it's metal" }],
      briefLines: [1, 2, 3].map((n) => ({ label: `L${n}`, value: "v", quote: "Not sure" })),
    });
    const r = checkDigest(vague, d).problems.join("\n");
    expect(r).toMatch(/number nobody said/);
    expect(r).toMatch(/Too much was proposed/);
  });
});
