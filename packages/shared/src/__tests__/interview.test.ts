import { describe, it, expect } from "vitest";
import { INTERVIEW_LIMITS, InterviewStateSchema, appendTurn, canAskMore, endInterview, interviewProgress, interviewStatements, newInterview, questionCount, quoteIsFromPerson, turnsForPrompt, type InterviewState } from "../interview";

const at = "2026-11-02T10:00:00.000Z";
let n = 0;
const turn = (role: "ai" | "person", text: string, extra: Record<string, unknown> = {}) => ({ id: `t${++n}`, role, text, at, ...extra }) as Parameters<typeof appendTurn>[1];
const add = (s: InterviewState, role: "ai" | "person", text: string, extra: Record<string, unknown> = {}): InterviewState => {
  const r = appendTurn(s, turn(role, text, extra));
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe("interview: turn order", () => {
  it("starts with a question, then alternates", () => {
    let s = newInterview(at);
    expect(appendTurn(s, turn("person", "Hello"))).toEqual({ ok: false, reason: "question_first" });
    s = add(s, "ai", "Which way does the roof face?");
    expect(appendTurn(s, turn("ai", "Another question"))).toEqual({ ok: false, reason: "answer_first" });
    s = add(s, "person", "North, I think.", { via: "voice" });
    expect(appendTurn(s, turn("person", "And more"))).toEqual({ ok: false, reason: "question_first" });
    expect(s.turns.map((t) => t.role)).toEqual(["ai", "person"]);
    expect(s.turns[1].via).toBe("voice");
  });

  it("ignores empty answers and tidies spaces", () => {
    const s = add(newInterview(at), "ai", "Question?");
    expect(appendTurn(s, turn("person", "   \n "))).toEqual({ ok: false, reason: "empty" });
    expect(add(s, "person", "  two   spaces\nhere ").turns[1].text).toBe("two spaces here");
  });

  it("shortens over-long text to the limit", () => {
    const s = add(newInterview(at), "ai", "x".repeat(5000));
    expect(s.turns[0].text.length).toBe(INTERVIEW_LIMITS.chars);
  });

  it("stops after the question limit, and after the interview has ended", () => {
    let s = newInterview(at);
    for (let i = 0; i < INTERVIEW_LIMITS.questions; i++) {
      s = add(s, "ai", `Question ${i}?`);
      s = add(s, "person", `Answer ${i}`);
    }
    expect(questionCount(s)).toBe(INTERVIEW_LIMITS.questions);
    expect(canAskMore(s)).toBe(false);
    expect(appendTurn(s, turn("ai", "One more?"))).toEqual({ ok: false, reason: "too_many_questions" });
    const ended = endInterview(newInterview(at));
    expect(ended.status).toBe("ended");
    expect(appendTurn(ended, turn("ai", "Q?"))).toEqual({ ok: false, reason: "ended" });
    expect(canAskMore(ended)).toBe(false);
  });

  it("never exceeds the turn limit", () => {
    const parsed = InterviewStateSchema.safeParse({ startedAt: at, status: "active", turns: Array.from({ length: INTERVIEW_LIMITS.turns + 1 }, (_, i) => ({ id: `x${i}`, role: i % 2 ? "person" : "ai", text: "t", at })) });
    expect(parsed.success).toBe(false);
  });
});

describe("interview: what the AI is sent, and what counts as the person's words", () => {
  it("sends only the most recent turns", () => {
    let s = newInterview(at);
    for (let i = 0; i < 10; i++) {
      s = add(s, "ai", `Q${i}?`);
      s = add(s, "person", `A${i}`);
    }
    const sent = turnsForPrompt(s);
    expect(sent.length).toBe(INTERVIEW_LIMITS.promptTurns);
    expect(sent[sent.length - 1]).toEqual({ role: "person", text: "A9" });
  });

  it("a quote must be something the person said, not the AI", () => {
    let s = add(newInterview(at), "ai", "Is the main board in a locked room?");
    s = add(s, "person", "The board is in the store room, it's not locked.");
    expect(quoteIsFromPerson("it's NOT locked", s.turns)).toBe(true);
    expect(quoteIsFromPerson("main board in a locked room", s.turns)).toBe(false); // the AI said that
    expect(quoteIsFromPerson("it was installed in 2015", s.turns)).toBe(false);
    expect(quoteIsFromPerson("no", s.turns)).toBe(false); // too short to mean anything
  });

  it("pairs each answer with the question it answered", () => {
    let s = add(newInterview(at), "ai", "Roof type?");
    s = add(s, "person", "Corrugated iron", { via: "text" });
    s = add(s, "ai", "Any shade?");
    s = add(s, "person", "A tree to the north west", { via: "voice" });
    expect(interviewStatements(s)).toEqual([
      { question: "Roof type?", answer: "Corrugated iron", via: "text" },
      { question: "Any shade?", answer: "A tree to the north west", via: "voice" },
    ]);
  });

  it("reports progress", () => {
    const s = add(add(newInterview(at), "ai", "Q1?"), "person", "A1");
    expect(interviewProgress(s)).toEqual({ asked: 1, answered: 1, max: INTERVIEW_LIMITS.questions });
  });
});
