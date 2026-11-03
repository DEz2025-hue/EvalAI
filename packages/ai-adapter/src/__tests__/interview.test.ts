import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nextInterviewQuestion, digestInterview, quoteIsFromPerson, INTERVIEW_QUESTION_PROMPT, INTERVIEW_DIGEST_PROMPT } from "../interview";

const fetchMock = vi.fn();
const chat = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 500, completion_tokens: 200, total_tokens: 700 } }), { status: 200 });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.AI_PROVIDER_API_KEY = "test-key-1234567890";
  process.env.AI_PROVIDER_BASE_URL = "https://api.meta.ai";
  for (const k of Object.keys(process.env)) if (/^(META_|AI_PROVIDER$|AI_MODEL_|AI_EFFORT_|AI_MAX_TOKENS_)/.test(k)) delete process.env[k];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const record = {
  workspaceId: "w",
  assessmentId: "a1",
  siteName: "Hillside School",
  mode: "assessment" as const,
  pack: "solar" as const,
  scenario: "new_install" as const,
  goal: "A rooftop array for the hall",
  siteBrief: { goal: "A rooftop array for the hall", intakeText: "Tin roof, tree to the north west" },
  checklist: [
    { title: "Orientation, tilt, shading survey", status: "needs_attention", notes: "tree NW", category: "Site", required: true },
    { title: "Load audit — demand & operating hours", status: "not_checked", category: "Customer", required: true },
    { title: "Electrical supply — main board", status: "pass", notes: "single phase", category: "Electrical", required: true },
  ],
  measurements: [{ name: "Roof area", value: 42.5, unit: "m²" }],
  findingCount: 1,
};

const sent = () => {
  const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as { messages: Array<{ role: string; content: string }> };
  return { system: body.messages.find((m) => m.role === "system")!.content, user: JSON.parse(body.messages.find((m) => m.role === "user")!.content) as Record<string, unknown> };
};

describe("interview question: what the model is given", () => {
  it("sends the record, the conversation so far and how many questions are left", async () => {
    fetchMock.mockResolvedValue(chat({ question: "What runs in the hall during the day?", why: "The load audit is not done.", topic: "Load audit — demand & operating hours", done: false }));
    const out = await nextInterviewQuestion({ ...record, turns: [{ role: "ai" as const, text: "Which way does the roof face?" }, { role: "person" as const, text: "North, mostly." }], questionsAsked: 1 });
    const { user } = sent();
    expect(user.task).toBe("interviewQuestion");
    expect(JSON.stringify(user.checklist)).toContain("Load audit");
    expect(JSON.stringify(user.turns)).toContain("North, mostly.");
    expect(user.questionsLeft).toBe(11);
    expect(out).toEqual({ question: "What runs in the hall during the day?", why: "The load audit is not done.", topic: "Load audit — demand & operating hours", done: false });
  });

  it("has the guard rails in the prompt", () => {
    expect(INTERVIEW_QUESTION_PROMPT).toMatch(/exactly ONE question/);
    expect(INTERVIEW_QUESTION_PROMPT).toMatch(/Never ask what the record or an earlier answer already tells you/);
    expect(INTERVIEW_QUESTION_PROMPT).toMatch(/never say that anything is fine, compliant or safe/);
    expect(INTERVIEW_DIGEST_PROMPT).toMatch(/unverified statement/);
    expect(INTERVIEW_DIGEST_PROMPT).toMatch(/copied exactly from one of their answers/);
    expect(INTERVIEW_DIGEST_PROMPT).toMatch(/never says pass, fail, fine, compliant or safe/);
  });
});

describe("interview question: what comes back is checked", () => {
  const ask = (content: unknown, turns: Array<{ role: "ai" | "person"; text: string }> = [], questionsAsked = turns.filter((t) => t.role === "ai").length) => {
    fetchMock.mockResolvedValue(chat(content));
    return nextInterviewQuestion({ ...record, turns, questionsAsked });
  };

  it("stops at the question limit without calling the model", async () => {
    const out = await nextInterviewQuestion({ ...record, turns: [], questionsAsked: 12 });
    expect(out).toMatchObject({ done: true, reason: "limit" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("done means no question", async () => {
    expect(await ask({ question: "Anything else?", why: "", topic: "", done: true })).toMatchObject({ done: true, question: "", reason: "enough" });
  });

  it("an empty question ends the interview rather than showing a blank card", async () => {
    expect(await ask({ question: "   ", why: "", topic: "", done: false })).toMatchObject({ done: true, reason: "empty" });
  });

  it("the same question in other words is not asked again", async () => {
    const turns = [{ role: "ai" as const, text: "Which way does the roof face?" }, { role: "person" as const, text: "North." }];
    expect(await ask({ question: "Which direction does the roof face?", why: "", topic: "", done: false }, turns)).toMatchObject({ done: true, reason: "repeat" });
  });

  it("a topic that is not a real checklist item is dropped, and a real one is kept as written", async () => {
    expect((await ask({ question: "Is there a generator?", why: "", topic: "Made up item", done: false })).topic).toBe("");
    expect((await ask({ question: "What uses power at night?", why: "", topic: "load audit - demand and operating hours", done: false })).topic).toBe("Load audit — demand & operating hours");
  });

  it("shortens a very long question", async () => {
    const out = await ask({ question: "Tell me about the roof. ".repeat(80), why: "", topic: "", done: false });
    expect(out.question.length).toBeLessThanOrEqual(300);
  });
});

describe("interview digest", () => {
  const turns = [
    { role: "ai" as const, text: "Where is the main board?" },
    { role: "person" as const, text: "It is in the store room next to the hall, and the door is never locked." },
    { role: "ai" as const, text: "Is anything running at night?" },
    { role: "person" as const, text: "Only the security lights and a fridge in the kitchen." },
  ];
  const digest = (content: unknown) => {
    fetchMock.mockResolvedValue(chat(content));
    return digestInterview({ ...record, turns });
  };
  const empty = { item_notes: [], finding_drafts: [], brief_lines: [], contradictions: [], open_questions: [] };

  it("sends the whole conversation and the record", async () => {
    await digest(empty);
    const { user } = sent();
    expect(user.task).toBe("interviewDigest");
    expect(JSON.stringify(user.turns)).toContain("security lights");
  });

  it("keeps a proposal only when its quote is the person's exact words and its item exists", async () => {
    const out = await digest({
      ...empty,
      item_notes: [
        { item_title: "Electrical supply — main board", note: "The person said the board is in the store room next to the hall.", quote: "It is in the store room next to the hall" },
        { item_title: "Load audit — demand & operating hours", note: "Reported night loads: security lights and a fridge.", quote: "only the security lights and a fridge" },
        { item_title: "Load audit — demand & operating hours", note: "Night loads are heavy.", quote: "there are lots of machines running" }, // never said
        { item_title: "Load audit — demand & operating hours", note: "Quoting the AI.", quote: "Is anything running at night" }, // the AI said it
        { item_title: "Invented item", note: "Not a real item.", quote: "the door is never locked" },
      ],
    });
    expect(out.itemNotes.map((i) => i.itemTitle)).toEqual(["Electrical supply — main board", "Load audit — demand & operating hours"]);
    expect(out.dropped.length).toBe(3);
    expect(out.requiresHumanReview).toBe(true);
  });

  it("finding drafts need at least one exact quote; brief lines need theirs", async () => {
    const out = await digest({
      ...empty,
      finding_drafts: [
        { title: "Board room is not locked", description: "The person said the door to the board room is never locked.", quotes: ["the door is never locked"] },
        { title: "Ungrounded", description: "Something nobody said.", quotes: ["the roof leaks badly"] },
      ],
      brief_lines: [
        { label: "Night use", value: "Security lights and a fridge", quote: "the security lights and a fridge" },
        { label: "Budget", value: "Small", quote: "we have a small budget" },
      ],
    });
    expect(out.findingDrafts.map((f) => f.title)).toEqual(["Board room is not locked"]);
    expect(out.briefLines.map((b) => b.label)).toEqual(["Night use"]);
    expect(out.dropped).toEqual(expect.arrayContaining(["Ungrounded", "Budget"]));
  });

  it("keeps contradictions and open questions, and flags figures nobody said", async () => {
    const out = await digest({
      ...empty,
      item_notes: [{ item_title: "Electrical supply — main board", note: "The person said the board is in the store room; the supply is 63 kW.", quote: "It is in the store room next to the hall" }],
      contradictions: [{ statement: "The person said the door is never locked", conflicts_with: "Checklist note: store room locked at night" }],
      open_questions: ["How many fridges run overnight?"],
    });
    expect(out.contradictions).toHaveLength(1);
    expect(out.openQuestions).toEqual(["How many fridges run overnight?"]);
    expect(out.unverifiedFigures).toContain("63 kW");
  });

  it("repeated notes for the same item are kept once", async () => {
    const note = { item_title: "Electrical supply — main board", note: "Board is in the store room.", quote: "store room next to the hall" };
    expect((await digest({ ...empty, item_notes: [note, note] })).itemNotes).toHaveLength(1);
  });

  it("refuses to digest a conversation with no answers", async () => {
    await expect(digestInterview({ ...record, turns: [{ role: "ai", text: "Q1?" }, { role: "ai", text: "Q2?" }] })).rejects.toThrow(/no answers/);
  });
});

describe("quoteIsFromPerson", () => {
  it("ignores case and punctuation and short quotes", () => {
    const t = [{ role: "person" as const, text: "It's NOT locked, honestly." }];
    expect(quoteIsFromPerson("its not locked", t)).toBe(true);
    expect(quoteIsFromPerson("no", t)).toBe(false);
  });
});
