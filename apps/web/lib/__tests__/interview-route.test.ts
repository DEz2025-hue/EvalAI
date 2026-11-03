import { describe, it, expect, vi, beforeEach } from "vitest";

const nextQuestion = vi.fn();
const digest = vi.fn();
vi.mock("@eval-ai/ai-adapter", async (orig) => {
  const real = await orig<typeof import("@eval-ai/ai-adapter")>();
  return { ...real, nextInterviewQuestion: (...a: unknown[]) => nextQuestion(...a), digestInterview: (...a: unknown[]) => digest(...a) };
});
vi.mock("../auth", () => ({ requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }) }));
vi.mock("../aiRoute", async (orig) => {
  const real = await orig<typeof import("../aiRoute")>();
  return { ...real, aiGuard: async () => null, aiRunHook: () => undefined };
});
const loadRecord = vi.fn();
vi.mock("../interviewRecord", () => ({ loadInterviewRecord: (...a: unknown[]) => loadRecord(...a) }));

import { POST as turn } from "../../app/api/ai/interview/route";
import { POST as digestRoute } from "../../app/api/ai/interview/digest/route";

const post = (fn: typeof turn, body: unknown) => fn(new Request("http://x/api/ai/interview", { method: "POST", body: JSON.stringify(body) }));
const record = { assessmentId: "a1", siteName: "Hillside School", mode: "assessment", pack: "solar", scenario: "new_install", checklist: [{ title: "Load audit", status: "not_checked" }], measurements: [], findingCount: 1 };

beforeEach(() => {
  for (const m of [nextQuestion, digest, loadRecord]) m.mockReset();
  loadRecord.mockResolvedValue(record);
  nextQuestion.mockResolvedValue({ question: "What runs at night?", why: "Load audit not done.", topic: "Load audit", done: false });
  digest.mockResolvedValue({ itemNotes: [], findingDrafts: [], briefLines: [], contradictions: [], openQuestions: [], dropped: [], unverifiedFigures: [], requiresHumanReview: true });
});

describe("POST /api/ai/interview", () => {
  it("builds the record from stored facts and returns the next question", async () => {
    const res = await post(turn, { assessmentId: "a1", turns: [{ role: "ai", text: "Roof type?" }, { role: "person", text: "Tin" }], questionsAsked: 1 });
    expect(res.status).toBe(200);
    expect(loadRecord).toHaveBeenCalledWith({}, "a1");
    const sent = nextQuestion.mock.calls[0][0];
    expect(sent).toMatchObject({ siteName: "Hillside School", questionsAsked: 1 });
    expect(sent.turns).toHaveLength(2);
    expect(await res.json()).toMatchObject({ question: "What runs at night?", done: false, draft: true });
  });

  it("starts an interview with no turns", async () => {
    expect((await post(turn, { assessmentId: "a1", turns: [], questionsAsked: 0 })).status).toBe(200);
  });

  it("rejects a bad request, too many questions, and over-long text", async () => {
    expect((await post(turn, {})).status).toBe(400);
    expect((await post(turn, { assessmentId: "a1", turns: [], questionsAsked: 99 })).status).toBe(400);
    expect((await post(turn, { assessmentId: "a1", turns: [{ role: "person", text: "x".repeat(2000) }], questionsAsked: 1 })).status).toBe(400);
    expect(nextQuestion).not.toHaveBeenCalled();
  });

  it("maps a provider failure", async () => {
    nextQuestion.mockRejectedValue(new Error("boom"));
    expect((await post(turn, { assessmentId: "a1", turns: [], questionsAsked: 0 })).status).toBeGreaterThanOrEqual(400);
  });
});

describe("POST /api/ai/interview/digest", () => {
  const turns = [{ role: "ai", text: "Where is the board?" }, { role: "person", text: "In the store room." }];

  it("sends the conversation and the stored record, and labels the result as a draft", async () => {
    const res = await post(digestRoute, { assessmentId: "a1", turns });
    expect(res.status).toBe(200);
    expect(digest.mock.calls[0][0]).toMatchObject({ siteName: "Hillside School", turns });
    const out = await res.json();
    expect(out.draft).toBe(true);
    expect(out.label).toMatch(/not verified facts/);
  });

  it("needs at least a question and an answer", async () => {
    expect((await post(digestRoute, { assessmentId: "a1", turns: [turns[0]] })).status).toBe(400);
  });
});
