import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { draftReportNarrative, draftReportSummary, capText, REPORT_SECTION_MAX, REPORT_ANALYST_PROMPT, REPORT_SUMMARY_PROMPT } from "../reportDraft";
import { cleanKeyFindings, sameSentence, withoutRepeats, DRAFT_FINDING_LIMITS } from "../keyFindings";
import { findUnverifiedFigures } from "../figures";

const fetchMock = vi.fn();
const chat = (content: unknown, finish = "stop") => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: finish }], usage: { prompt_tokens: 900, completion_tokens: 600, total_tokens: 1500 } }), { status: 200 });

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

const job = {
  workspaceId: "w",
  assessmentId: "a1",
  siteName: "Hillside School",
  mode: "assessment" as const,
  pack: "solar" as const,
  scenario: "new_install" as const,
  checklist: [
    { title: "Orientation, tilt, shading survey", status: "needs_attention", notes: "tree NW, shades pm", category: "Site", required: true, covers: "Note which way the surface faces.", evidenceCount: 2 },
    { title: "Measurements — roof area", status: "pass", category: "Measurements", required: true, measured: { value: 42.5, unit: "m²" } },
    { title: "Electrical supply — main board", status: "fail", notes: "no earth strap seen", category: "Electrical", required: true },
    { title: "Load audit", status: "not_checked", category: "Customer", required: true },
  ],
  findings: [{ title: "Missing earth strap", severity: "high", description: "No earth strap was visible at the main board.", uncertainty: "Back of board not opened" }],
  findingsAwaitingReview: 2,
  measurements: [{ name: "Roof area", value: 42.5, unit: "m²" }],
  limitations: ["Load audit: not checked yet (required)"],
  glance: { total: 4, checked: 3, pass: 1, issue: 1, needsAttention: 1, notApplicable: 0, notChecked: 1, requiredNotChecked: 1 },
  siteBrief: { goal: "Quote a rooftop array", intakeText: "Tin roof, big tree to the north-west", answers: [{ question: "Access", answer: "Ladder needed" }] },
  photos: [
    { id: "ev-aaa", itemTitle: "Orientation, tilt, shading survey", caption: "A large tree beside the hall roof.", observations: ["Tree is taller than the roof edge"], possibleIssues: ["Branches may touch the roof"], cannotTell: ["Roof underside"] },
    { id: "ev-bbb", itemTitle: "Electrical supply — main board", caption: "The main board in a store room.", observations: ["No earth conductor visible"], possibleIssues: [], cannotTell: [] },
  ],
};

const finding = (over: Record<string, unknown> = {}) => ({
  title: "Afternoon shading from a tree",
  priority: "medium",
  observed: "A tree on the north-west side shades the roof in the afternoon (Photo 1).",
  meaning: "Shade on part of an array can lower the output of the whole string, so placement and panel layout need care.",
  action: "Confirm the tree's height and spacing on site and have a qualified person assess the shading before sizing the array.",
  item_titles: ["Orientation, tilt, shading survey"],
  photo_numbers: [1],
  measurement_names: [],
  finding_titles: [],
  ...over,
});

const answer = (over: Record<string, unknown> = {}) => ({
  summary: "Hillside School was surveyed for a new rooftop array. Three of four items are checked and one required item is still to do.",
  site_overview: "A single-storey school with a tin roof.",
  key_findings: [finding()],
  open_items: "The load audit has not been done. 2 findings are awaiting review.",
  missing_information: ["Roof strength"],
  assumptions: [],
  ...over,
});

const sent = () => {
  const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as { messages: Array<{ role: string; content: string }>; max_completion_tokens?: number };
  return { system: body.messages.find((m) => m.role === "system")!.content, user: JSON.parse(body.messages.find((m) => m.role === "user")!.content) as Record<string, unknown>, body };
};

describe("report analysis: what the model is given", () => {
  it("sends the whole record, with photos numbered so a finding can cite them", async () => {
    fetchMock.mockResolvedValue(chat(answer()));
    await draftReportNarrative(job);
    const { user } = sent();
    expect(user.siteBrief).toMatchObject({ goal: "Quote a rooftop array", intakeText: "Tin roof, big tree to the north-west" });
    expect(user.glance).toMatchObject({ total: 4, checked: 3, requiredNotChecked: 1 });
    expect(user.checklist).toEqual(expect.arrayContaining([expect.objectContaining({ category: "Site", required: true, covers: "Note which way the surface faces.", evidenceCount: 2 })]));
    expect(user.photoNotes).toEqual([expect.objectContaining({ number: 1, caption: "A large tree beside the hall roof." }), expect.objectContaining({ number: 2, itemTitle: "Electrical supply — main board" })]);
    expect(user.limitations).toEqual(["Load audit: not checked yet (required)"]);
    expect(user.findingsAwaitingReview).toBe(2);
    expect(user.situation).toBeTruthy();
  });

  it("never sends the content of findings nobody has confirmed (only how many)", async () => {
    fetchMock.mockResolvedValue(chat(answer()));
    await draftReportNarrative({ ...job, findings: [] });
    const raw = JSON.stringify(sent().user);
    expect(raw).toContain('"findingsAwaitingReview":2');
    expect(raw).not.toMatch(/needs_review/);
  });

  it("has room for a full report, with the safety frame", async () => {
    fetchMock.mockResolvedValue(chat(answer()));
    await draftReportNarrative(job);
    expect(sent().body.max_completion_tokens).toBeGreaterThanOrEqual(12000);
    expect(sent().system).toMatch(/Never invent measurements, prices, standards, compliance results/);
    expect(sent().system).toContain(REPORT_ANALYST_PROMPT);
  });
});

describe("report analysis: the rules it is given", () => {
  it("asks for interpretation, synthesis and professional communication, and lets 'meaning' use general trade knowledge", () => {
    expect(REPORT_ANALYST_PROMPT).toMatch(/INTERPRET the evidence, SYNTHESIZE it into a few technical findings, and COMMUNICATE/);
    expect(REPORT_ANALYST_PROMPT).toMatch(/combine related observations .* into ONE finding instead of repeating them/);
    expect(REPORT_ANALYST_PROMPT).toMatch(/Include every confirmed finding/);
    expect(REPORT_ANALYST_PROMPT).toMatch(/expand them into proper sentences without adding facts/);
    expect(REPORT_ANALYST_PROMPT).toMatch(/MAY draw on general technical knowledge/);
    expect(REPORT_ANALYST_PROMPT).toMatch(/Do NOT repeat the text of the findings/);
    expect(REPORT_ANALYST_PROMPT).not.toMatch(/under 180 words|no action is supported/);
  });

  it("keeps the guard rails", () => {
    expect(REPORT_ANALYST_PROMPT).toMatch(/never add site facts, measurements, sizes, capacities, ages, counts, prices or compliance statements/);
    expect(REPORT_ANALYST_PROMPT).toMatch(/Do not name standards, codes or clause numbers/);
    expect(REPORT_ANALYST_PROMPT).toMatch(/Not Checked has not been checked: never describe it as fine/);
    expect(REPORT_ANALYST_PROMPT).toMatch(/never guess what they say/);
    expect(REPORT_ANALYST_PROMPT).toMatch(/guidance, not something that was observed/);
    expect(REPORT_ANALYST_PROMPT).toMatch(/UNVERIFIED/);
    expect(REPORT_ANALYST_PROMPT).toMatch(/Never present a photo note as a confirmed finding/);
    expect(REPORT_ANALYST_PROMPT).toMatch(/never state a measurement, count or rating that comes from a photo/);
    expect(REPORT_ANALYST_PROMPT).toMatch(/A finding with no source is not allowed/);
  });
});

describe("report analysis: what comes back is cleaned", () => {
  it("returns findings with their sources turned into real references, highest priority first", async () => {
    fetchMock.mockResolvedValue(
      chat(answer({
        key_findings: [
          finding(),
          finding({ title: "No earth connection at the main board", priority: "high", observed: "No earth strap was visible at the main board (Photo 2).", meaning: "A missing earth connection means a fault could leave exposed metal live.", action: "Have a qualified electrician inspect and, if needed, install the earth connection.", item_titles: ["electrical supply — main board"], photo_numbers: [2], finding_titles: ["Missing earth strap"] }),
        ],
      })),
    );
    const out = await draftReportNarrative(job);
    expect(out.keyFindings.map((f) => f.title)).toEqual(["No earth connection at the main board", "Afternoon shading from a tree"]);
    expect(out.keyFindings[0].basis).toEqual([
      { kind: "item", ref: "Electrical supply — main board" }, // matched ignoring case, returned exactly as the report has it
      { kind: "photo", ref: "ev-bbb" }, // "Photo 2" -> its evidence id
      { kind: "finding", ref: "Missing earth strap" },
    ]);
    expect(out).toMatchObject({ siteOverview: "A single-storey school with a tin roof.", missingInformation: ["Roof strength"], requiresHumanReview: true });
  });

  it("removes sources that don't exist, and findings that are incomplete or have no real source", async () => {
    fetchMock.mockResolvedValue(
      chat(answer({
        key_findings: [
          finding({ item_titles: ["Made up item"], photo_numbers: [1, 9, 0, -1] }), // keeps only Photo 1
          finding({ title: "Invented concern", item_titles: ["Nothing like this"], photo_numbers: [7] }), // no real source
          finding({ title: "No action given", action: "  " }),
          finding({ title: "No meaning given", meaning: "" }),
          finding({ title: "Context for the reader", priority: "info", item_titles: [], photo_numbers: [] }), // info may stand alone
        ],
      })),
    );
    const out = await draftReportNarrative(job);
    expect(out.keyFindings.map((f) => f.title)).toEqual(["Afternoon shading from a tree", "Context for the reader"]);
    expect(out.keyFindings[0].basis).toEqual([{ kind: "photo", ref: "ev-aaa" }]);
    expect(out.droppedFindings).toEqual(["Invented concern", "No action given", "No meaning given"]);
  });

  it("drops a second finding with the same title, and keeps at most twelve", async () => {
    const many = Array.from({ length: 15 }, (_, i) => finding({ title: `Distinct finding number ${i}` }));
    fetchMock.mockResolvedValue(chat(answer({ key_findings: [finding(), finding(), ...many] })));
    const out = await draftReportNarrative(job);
    expect(out.keyFindings).toHaveLength(DRAFT_FINDING_LIMITS.max);
    expect(out.keyFindings.filter((f) => f.title === "Afternoon shading from a tree")).toHaveLength(1);
  });

  it("removes from the summary and open items any sentence a finding already says", async () => {
    const repeated = "A tree on the north-west side shades the roof in the afternoon (Photo 1).";
    fetchMock.mockResolvedValue(chat(answer({ summary: `Hillside School was surveyed for a new rooftop array. ${repeated} The main priority is the missing earth connection.`, open_items: `${repeated} The load audit has not been done.` })));
    const out = await draftReportNarrative(job);
    expect(out.summary).not.toContain("shades the roof in the afternoon");
    expect(out.summary).toContain("The main priority is the missing earth connection.");
    expect(out.openItems).toBe("The load audit has not been done.");
  });

  it("refuses an answer with no summary, and still works when the model returns no findings", async () => {
    fetchMock.mockResolvedValue(chat(answer({ summary: "   " })));
    await expect(draftReportNarrative(job)).rejects.toThrow(/did not produce a summary/);
    fetchMock.mockResolvedValue(chat({ summary: "A short summary of the visit." }));
    const out = await draftReportNarrative(job);
    expect(out).toMatchObject({ summary: "A short summary of the visit.", keyFindings: [], siteOverview: "", openItems: "" });
  });

  it("keeps each written part within the limit the report editor accepts, cutting at a sentence", async () => {
    const long = "A sentence about the site that goes on a bit. ".repeat(500);
    fetchMock.mockResolvedValue(chat(answer({ summary: long, key_findings: [finding({ observed: long, meaning: long, action: long })] })));
    const out = await draftReportNarrative(job);
    expect(out.summary.length).toBeLessThanOrEqual(REPORT_SECTION_MAX.summary);
    expect(out.keyFindings[0].observed.length).toBeLessThanOrEqual(DRAFT_FINDING_LIMITS.observed);
    expect(out.keyFindings[0].action.length).toBeLessThanOrEqual(DRAFT_FINDING_LIMITS.action);
    expect(out.summary.endsWith(".")).toBe(true);
  });

  it("flags a figure that is not in the facts, wherever the model wrote it, and leaves figures that are", async () => {
    fetchMock.mockResolvedValue(chat(answer({ key_findings: [finding({ observed: "The roof area is 42.5 m² (Photo 1).", meaning: "The array would need about 12 kW and the roof is 25 years old." })], open_items: "Budget around $8,400." })));
    const out = await draftReportNarrative(job);
    expect(out.unverifiedFigures).toEqual(expect.arrayContaining(["12 kW", "25 years", "$8,400"]));
    expect(out.unverifiedFigures).not.toContain("42.5 m²");
  });
});

describe("rewriting the summary from edited findings", () => {
  const edited = {
    workspaceId: "w", assessmentId: "a1", siteName: "Hillside School", mode: "assessment" as const, pack: "solar" as const, scenario: "new_install" as const,
    siteBrief: job.siteBrief, glance: job.glance, limitations: job.limitations, findingsAwaitingReview: 2,
    keyFindings: [{ title: "My own wording of the shading issue", priority: "high" as const, observed: "The tree overshadows the roof until late afternoon.", meaning: "That limits afternoon output.", action: "Survey the shade path." }],
  };

  it("uses only the findings as the person left them, with the rules, and returns just the summary and open items", async () => {
    fetchMock.mockResolvedValue(chat({ summary: "The survey found one high priority issue. The tree overshadows the roof until late afternoon.", open_items: "The load audit is still to do." }));
    const out = await draftReportSummary(edited);
    const { system, user } = sent();
    expect(system).toContain(REPORT_SUMMARY_PROMPT);
    expect(REPORT_SUMMARY_PROMPT).toMatch(/the person has edited them, so treat them as authoritative/);
    expect(user.keyFindings).toEqual([expect.objectContaining({ title: "My own wording of the shading issue", priority: "high" })]);
    expect(JSON.stringify(user)).not.toContain("photoNotes");
    expect(out.summary).toBe("The survey found one high priority issue.");
    expect(out.openItems).toBe("The load audit is still to do.");
  });

  it("refuses an empty summary", async () => {
    fetchMock.mockResolvedValue(chat({ summary: " ", open_items: "x" }));
    await expect(draftReportSummary(edited)).rejects.toThrow(/did not produce a summary/);
  });
});

describe("cleaning helpers", () => {
  it("capText cuts at a paragraph or sentence, not mid-word", () => {
    expect(capText("short", 100)).toBe("short");
    expect(capText("First paragraph here.\n\nSecond paragraph that goes on and on and on", 40)).toBe("First paragraph here.");
    expect(capText("One long sentence here. Another sentence runs past the limit", 40)).toBe("One long sentence here.");
    expect(capText("averyveryverylongwordwithoutbreaks and more", 20).length).toBeLessThanOrEqual(20);
  });

  it("sameSentence: identical, or mostly the same words; short sentences only when identical", () => {
    expect(sameSentence("The roof is sound.", "the roof is sound")).toBe(true);
    expect(sameSentence("A tree on the north-west side shades the roof in the afternoon.", "The tree on the north-west side shades the roof during the afternoon.")).toBe(true);
    expect(sameSentence("A tree on the north-west side shades the roof in the afternoon.", "The earth strap at the main board is missing and needs fitting.")).toBe(false);
    expect(sameSentence("Roof is fine.", "Roof is fine here.")).toBe(false);
  });

  it("withoutRepeats keeps the original when little would be left", () => {
    expect(withoutRepeats("The roof is sound and the tin sheets are well fixed along the ridge.", ["The roof is sound and the tin sheets are well fixed along the ridge."])).toContain("tin sheets");
  });

  it("cleanKeyFindings ignores anything that is not a list", () => {
    expect(cleanKeyFindings(undefined, { items: [], photoIds: [], measurements: [], findings: [] })).toEqual({ findings: [], dropped: [] });
    expect(cleanKeyFindings("nope", { items: [], photoIds: [], measurements: [], findings: [] })).toEqual({ findings: [], dropped: [] });
  });
});

describe("findUnverifiedFigures", () => {
  const facts = { notes: "Roof 42.5 m², 3 panels, inverter 5 kW", counts: { checked: 12 } };

  it("flags figures with a unit, %, or amount that are not in the facts", () => {
    expect(findUnverifiedFigures("About 40 m² of roof, 8 kW, 15%, and 230V, 1,200 USD, €300.", facts)).toEqual(["40 m²", "8 kW", "15%", "230V", "1,200 USD", "€300"]);
  });

  it("accepts figures that are in the facts, and ignores bare numbers and words that only start like a unit", () => {
    expect(findUnverifiedFigures("The roof is 42.5 m² with 3 panels and a 5 kW inverter; 12 items were checked. 2 in total, 7 meters of cable.", facts)).toEqual([]);
    expect(findUnverifiedFigures("Within months, an amazing result in a few days.", facts)).toEqual([]);
  });

  it("reports each figure once, at most ten, in order", () => {
    const text = Array.from({ length: 15 }, (_, i) => `${100 + i} kW`).join(", ") + ", 100 kW";
    const out = findUnverifiedFigures(text, {});
    expect(out).toHaveLength(10);
    expect(out[0]).toBe("100 kW");
  });
});

describe("report analysis: the site interview (D-030)", () => {
  it("passes the interview to the model and tells it these are statements, not facts", async () => {
    fetchMock.mockResolvedValue(chat(answer()));
    await draftReportNarrative({ ...job, siteBrief: { ...job.siteBrief, interview: { details: [{ label: "Night use", value: "Lights and a fridge" }], statements: [{ question: "Where is the board?", answer: "In the store room" }], openQuestions: [] } } });
    const { system, user } = sent();
    expect(JSON.stringify(user.siteBrief)).toContain("Lights and a fridge");
    expect(system).toMatch(/siteBrief\.interview/);
    expect(system).toMatch(/STATEMENTS, not verified facts/);
    expect(system).toMatch(/never to change or contradict a checklist outcome/);
  });
});
