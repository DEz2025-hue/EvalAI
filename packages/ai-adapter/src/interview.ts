import { z } from "zod";
import { getAdapterConfig } from "./config";
import { AiAdapterError } from "./client";
import { situationHint } from "./situation";
import { chatJson, type CallOptions } from "./chat";
import { interviewDigestSchema, interviewTurnSchema } from "./jsonSchemas";
import { SYSTEM_GUARD, compact } from "./text";
import { findUnverifiedFigures } from "./figures";
import { capText } from "./keyFindings";
import { meaningWords } from "./checklistOverlap";
import { ScenarioField } from "./situation";

// Site interview (D-030). The AI asks one question at a time and, when the person is done, proposes notes from what they said.
// It never changes a checklist status, never treats a spoken number as a measurement, and every proposal must quote the person's own words.

export const INTERVIEW_AI_LIMITS = { maxQuestions: 12, question: 300, why: 200, note: 500, findingTitle: 150, findingText: 700, brief: 400, items: 12, findings: 6, lines: 8 } as const;

const ChecklistRow = z.object({
  title: z.string().max(500),
  status: z.string(),
  notes: z.string().max(1500).optional(),
  category: z.string().max(100).optional(),
  required: z.boolean().optional(),
  covers: z.string().max(800).optional(),
});

const Common = z.object({
  workspaceId: z.string().min(1).max(100),
  assessmentId: z.string().min(1).max(100),
  siteName: z.string().max(200),
  mode: z.enum(["assessment", "inspection"]),
  pack: z.enum(["solar", "cctv"]),
  scenario: ScenarioField,
  goal: z.string().max(1000).optional(),
  siteBrief: z
    .object({
      address: z.string().max(300).optional(),
      goal: z.string().max(1500).optional(),
      existingEquipment: z.string().max(1500).optional(),
      constraints: z.string().max(1500).optional(),
      intakeText: z.string().max(2000).optional(),
      answers: z.array(z.object({ question: z.string().max(300), answer: z.string().max(1000) })).max(30).optional(),
    })
    .optional(),
  checklist: z.array(ChecklistRow).max(300),
  measurements: z.array(z.object({ name: z.string(), value: z.number(), unit: z.string() })).max(100).default([]),
  findingCount: z.number().int().min(0).default(0),
});

const Turn = z.object({ role: z.enum(["ai", "person"]), text: z.string().min(1).max(1500) });

export const InterviewTurnInput = Common.extend({
  turns: z.array(Turn).max(20),
  questionsAsked: z.number().int().min(0).max(100),
  maxQuestions: z.number().int().min(1).max(30).default(INTERVIEW_AI_LIMITS.maxQuestions),
});

export const InterviewDigestInput = Common.extend({ turns: z.array(Turn).min(2).max(40) });

/** The rules for choosing the next question. Exported so tests can check the guard rails are present. */
export const INTERVIEW_QUESTION_PROMPT =
  " You are interviewing a solar or CCTV technician or site contact by voice, to learn what the saved record does not yet say. Ask exactly ONE question each turn, in plain spoken language a person can answer aloud in a sentence or two. " +
  "First read the whole record (siteBrief, checklist with its notes and covers, measurements) and the conversation so far (turns). Never ask what the record or an earlier answer already tells you, and never ask the same thing twice in different words. " +
  "Prefer: required checklist items that are Not Checked, notes that are vague or contradict each other, and facts the job needs that nobody has said (what the customer wants, how the site is used, constraints, access, who decides). " +
  "Follow up on an answer when it opens something important (an unclear amount, a hazard, a condition) before moving on. Do not ask for measurements as if you were recording them; you may ask what the person knows or has seen. " +
  "topic: the exact title of the checklist item the question is about, or an empty string when it is about the job in general. why: one short sentence on why you are asking. " +
  "Set done to true, with an empty question, when you have enough or no useful question is left. Do not praise, lecture or give advice, and never say that anything is fine, compliant or safe. Ask one question at a time and only one.";

/** The rules for turning a finished conversation into proposals. */
export const INTERVIEW_DIGEST_PROMPT =
  " You are reading the transcript of an interview with a technician or site contact (turns: role 'ai' asked, role 'person' answered), together with the saved record of the job. Propose what is worth adding to the record. You propose; a person will accept or remove each item. " +
  "Everything the person says is an unverified statement, never a fact. Write proposals as what the person reported ('The person said the main board is in the store room'), not as findings of your own, and never as a measurement. " +
  "Every proposal needs a quote: the person's own words, copied exactly from one of their answers. Do not quote the 'ai' turns. A proposal without an exact quote from the person is not allowed. " +
  "item_notes: a short note to attach to one checklist item (item_title exactly as supplied) when the person said something relevant to it. The note records the statement; it does not decide the item's result and never says pass, fail, fine, compliant or safe. " +
  "finding_drafts: only for something the person described that could be a problem or a risk (at most a few); description says what was reported and what is not known. " +
  "brief_lines: facts about the job from the conversation that belong in the report's site brief (for example how the site is used, what the customer wants, constraints), each with a short label. " +
  "contradictions: where something the person said disagrees with a recorded checklist note or measurement; say both sides plainly. open_questions: what was left unanswered or unclear and should be checked on site. " +
  "Rules: never add numbers, sizes, ages, counts or dates that the person did not say; do not name standards or codes; do not repeat the same point across item_notes, finding_drafts and brief_lines.";

const blank = (s: unknown) => (typeof s === "string" ? s.trim() : "");
const list = (a: unknown, max: number, len = 400) => (Array.isArray(a) ? a : []).map(blank).filter(Boolean).slice(0, max).map((s) => capText(s, len));
const fold = (s: string) => s.toLowerCase().replace(/['’]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const QUESTION_WORDS = new Set(["which", "what", "how", "where", "who", "when", "why", "do", "does", "did", "is", "are", "was", "were", "you", "your", "there", "can", "could", "would", "tell", "me", "about", "any", "way", "direction", "kind", "type", "sort", "much", "many"]);
/** The meaningful words of a question, without the question words that every question has. */
function questionWords(q: string): Set<string> {
  return new Set([...meaningWords(q)].filter((w) => !QUESTION_WORDS.has(w)));
}

/** Is this the same question as an earlier one, in other words? Compares the words that carry the meaning. */
export function sameQuestion(a: string, b: string): boolean {
  const x = questionWords(a);
  const y = questionWords(b);
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  if (shared < 2 && !(shared === 1 && x.size === 1 && y.size === 1)) return false;
  return shared / (x.size + y.size - shared) >= 0.5;
}

/** Same checklist title, ignoring case, punctuation and small words ("&" and "and"). */
function sameTitle(a: string, b: string): boolean {
  if (fold(a) === fold(b)) return true;
  const x = meaningWords(a);
  const y = meaningWords(b);
  return x.size > 0 && x.size === y.size && [...x].every((w) => y.has(w));
}

/** A quote counts only if it is in something the person said (the AI's own words do not count). Case and punctuation are ignored. */
export function quoteIsFromPerson(quote: string, turns: Array<{ role?: string; text?: string }>): boolean {
  const q = fold(quote);
  return q.length >= 4 && turns.some((t) => t.role === "person" && fold(t.text ?? "").includes(q));
}

export type InterviewQuestion = { question: string; why: string; topic: string; done: boolean; reason?: "enough" | "limit" | "repeat" | "empty" };

const recordOf = (v: z.infer<typeof Common>) => ({
  siteName: v.siteName,
  mode: v.mode,
  pack: v.pack,
  situation: situationHint(v.scenario),
  goal: v.goal,
  siteBrief: compact(v.siteBrief ?? {}),
  checklist: compact(v.checklist),
  measurements: compact(v.measurements),
  confirmedFindingCount: v.findingCount,
});

/** Ask the next question. Returns done when the question limit is reached, the model has enough, or it can only repeat itself. */
export async function nextInterviewQuestion(input: z.input<typeof InterviewTurnInput>, options?: CallOptions): Promise<InterviewQuestion> {
  const v = InterviewTurnInput.parse(input);
  if (v.questionsAsked >= v.maxQuestions) return { question: "", why: "", topic: "", done: true, reason: "limit" };
  const cfg = getAdapterConfig();
  const { data } = await chatJson(
    cfg,
    "interview",
    {
      system: SYSTEM_GUARD + INTERVIEW_QUESTION_PROMPT,
      user: JSON.stringify({ task: "interviewQuestion", ...recordOf(v), questionsAsked: v.questionsAsked, questionsLeft: v.maxQuestions - v.questionsAsked, turns: compact(v.turns) }),
      schemaName: "interview_question",
      schema: interviewTurnSchema(),
    },
    options,
  );
  const raw = data as Record<string, unknown>;
  const question = capText(blank(raw.question), INTERVIEW_AI_LIMITS.question);
  if (raw.done === true) return { question: "", why: "", topic: "", done: true, reason: "enough" };
  if (!question) return { question: "", why: "", topic: "", done: true, reason: "empty" };
  // The same question in other words is not a new question: end rather than ask it again.
  if (v.turns.some((t) => t.role === "ai" && sameQuestion(question, t.text))) return { question: "", why: "", topic: "", done: true, reason: "repeat" };
  const topicRaw = blank(raw.topic);
  const topic = topicRaw ? (v.checklist.find((c) => sameTitle(c.title, topicRaw))?.title ?? "") : "";
  return { question, why: capText(blank(raw.why), INTERVIEW_AI_LIMITS.why), topic, done: false };
}

export type InterviewDigest = {
  itemNotes: Array<{ itemTitle: string; note: string; quote: string }>;
  findingDrafts: Array<{ title: string; description: string; quotes: string[] }>;
  briefLines: Array<{ label: string; value: string; quote: string }>;
  contradictions: Array<{ statement: string; conflictsWith: string }>;
  openQuestions: string[];
  /** Proposals the model wrote that were left out (no exact quote from the person, or no such checklist item). */
  dropped: string[];
  unverifiedFigures: string[];
  requiresHumanReview: true;
};

/** Turn a finished conversation into proposals. Only proposals backed by the person's exact words and a real checklist item are kept. */
export async function digestInterview(input: z.input<typeof InterviewDigestInput>, options?: CallOptions): Promise<InterviewDigest> {
  const v = InterviewDigestInput.parse(input);
  if (!v.turns.some((t) => t.role === "person")) throw new AiAdapterError("There are no answers to read yet", "invalid_response");
  const cfg = getAdapterConfig();
  const { data } = await chatJson(
    cfg,
    "interview",
    {
      system: SYSTEM_GUARD + INTERVIEW_DIGEST_PROMPT,
      user: JSON.stringify({ task: "interviewDigest", ...recordOf(v), turns: compact(v.turns) }),
      schemaName: "interview_digest",
      schema: interviewDigestSchema(),
    },
    options,
  );
  const raw = data as Record<string, unknown>;
  const dropped: string[] = [];
  const arr = (a: unknown) => (Array.isArray(a) ? (a as Array<Record<string, unknown>>) : []);

  const itemNotes: InterviewDigest["itemNotes"] = [];
  const seenNotes = new Set<string>();
  for (const r of arr(raw.item_notes).slice(0, INTERVIEW_AI_LIMITS.items * 2)) {
    const row = v.checklist.find((c) => sameTitle(c.title, blank(r.item_title)));
    const note = capText(blank(r.note), INTERVIEW_AI_LIMITS.note);
    const quote = blank(r.quote);
    if (!row || !note || !quoteIsFromPerson(quote, v.turns)) {
      dropped.push(note || blank(r.item_title) || "(empty note)");
      continue;
    }
    const key = fold(row.title) + "|" + fold(note);
    if (seenNotes.has(key) || itemNotes.length >= INTERVIEW_AI_LIMITS.items) continue;
    seenNotes.add(key);
    itemNotes.push({ itemTitle: row.title, note, quote });
  }

  const findingDrafts: InterviewDigest["findingDrafts"] = [];
  for (const r of arr(raw.finding_drafts).slice(0, INTERVIEW_AI_LIMITS.findings * 2)) {
    const title = capText(blank(r.title), INTERVIEW_AI_LIMITS.findingTitle);
    const description = capText(blank(r.description), INTERVIEW_AI_LIMITS.findingText);
    const quotes = list(r.quotes, 3, 300).filter((q) => quoteIsFromPerson(q, v.turns));
    if (!title || !description || quotes.length === 0) {
      dropped.push(title || "(empty finding)");
      continue;
    }
    if (findingDrafts.length < INTERVIEW_AI_LIMITS.findings) findingDrafts.push({ title, description, quotes });
  }

  const briefLines: InterviewDigest["briefLines"] = [];
  for (const r of arr(raw.brief_lines).slice(0, INTERVIEW_AI_LIMITS.lines * 2)) {
    const label = capText(blank(r.label), 60);
    const value = capText(blank(r.value), INTERVIEW_AI_LIMITS.brief);
    const quote = blank(r.quote);
    if (!label || !value || !quoteIsFromPerson(quote, v.turns)) {
      dropped.push(label || "(empty line)");
      continue;
    }
    if (briefLines.length < INTERVIEW_AI_LIMITS.lines) briefLines.push({ label, value, quote });
  }

  const contradictions = arr(raw.contradictions)
    .map((r) => ({ statement: capText(blank(r.statement), 300), conflictsWith: capText(blank(r.conflicts_with), 300) }))
    .filter((c) => c.statement && c.conflictsWith)
    .slice(0, 6);
  const openQuestions = list(raw.open_questions, 8, 300);

  // D-010: a figure with a unit or amount in a proposal must be something the person said or the record holds.
  const written = [...itemNotes.map((i) => i.note), ...findingDrafts.flatMap((f) => [f.title, f.description]), ...briefLines.map((b) => b.value), ...openQuestions].join("\n");
  const unverifiedFigures = findUnverifiedFigures(written, [v.turns.filter((t) => t.role === "person"), recordOf(v)]);
  return { itemNotes, findingDrafts, briefLines, contradictions, openQuestions, dropped, unverifiedFigures, requiresHumanReview: true };
}
