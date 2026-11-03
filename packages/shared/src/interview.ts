import { z } from "zod";

// Site interview (D-030): a turn-based conversation in which the AI asks one question at a time and the person answers by voice or text.
// Pure rules, tested without a phone. Everything the person says is an UNVERIFIED STATEMENT: it never sets a checklist status and is never
// stored as a measurement. The AI proposes notes from the conversation; the person accepts or removes each one.

export const INTERVIEW_LIMITS = {
  /** Turns kept in one interview (questions and answers together). */
  turns: 40,
  /** Characters kept per turn. */
  chars: 1500,
  /** Questions the AI may ask in one interview. */
  questions: 12,
  /** Most recent turns sent to the AI with each request. */
  promptTurns: 20,
} as const;

export type InterviewRole = "ai" | "person";
export type InterviewVia = "voice" | "text";

export const InterviewTurnSchema = z.object({
  id: z.string().min(1).max(60),
  role: z.enum(["ai", "person"]),
  text: z.string().min(1).max(INTERVIEW_LIMITS.chars),
  at: z.string().max(40),
  /** How a person's answer was given. Voice answers come from a transcript the person could edit. */
  via: z.enum(["voice", "text"]).optional(),
  /** For an AI turn: the checklist item the question is about, when there is one. */
  topic: z.string().max(300).optional(),
});
export type InterviewTurn = z.infer<typeof InterviewTurnSchema>;

export const InterviewStateSchema = z.object({
  startedAt: z.string().max(40),
  turns: z.array(InterviewTurnSchema).max(INTERVIEW_LIMITS.turns),
  /** "active": questions are being asked. "ended": the person stopped or the AI had enough. "reviewed": the proposals were handled. */
  status: z.enum(["active", "ended", "reviewed"]),
  reviewedAt: z.string().max(40).optional(),
  /** Lines the person accepted for the report's site brief, each with the exact words that back it. */
  brief: z.array(z.object({ label: z.string().max(60), value: z.string().max(INTERVIEW_LIMITS.chars), quote: z.string().max(INTERVIEW_LIMITS.chars) })).max(8).optional(),
  /** Questions the interview left open, for the report's open items. */
  openQuestions: z.array(z.string().max(300)).max(8).optional(),
});
export type InterviewState = z.infer<typeof InterviewStateSchema>;

export function newInterview(now: string): InterviewState {
  return { startedAt: now, turns: [], status: "active" };
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

export type AppendResult = { ok: true; state: InterviewState } | { ok: false; reason: "ended" | "empty" | "full" | "too_many_questions" | "answer_first" | "question_first" };

/** Adds one turn. A question must follow an answer (or start the interview) and an answer must follow a question. Over-long text is shortened. */
export function appendTurn(state: InterviewState, turn: { id: string; role: InterviewRole; text: string; at: string; via?: InterviewVia; topic?: string }): AppendResult {
  if (state.status !== "active") return { ok: false, reason: "ended" };
  const text = squash(turn.text).slice(0, INTERVIEW_LIMITS.chars);
  if (!text) return { ok: false, reason: "empty" };
  if (state.turns.length >= INTERVIEW_LIMITS.turns) return { ok: false, reason: "full" };
  const last = state.turns[state.turns.length - 1];
  if (turn.role === "ai") {
    if (last?.role === "ai") return { ok: false, reason: "answer_first" };
    if (questionCount(state) >= INTERVIEW_LIMITS.questions) return { ok: false, reason: "too_many_questions" };
  } else if (!last || last.role !== "ai") {
    return { ok: false, reason: "question_first" };
  }
  const next: InterviewTurn = { id: turn.id, role: turn.role, text, at: turn.at, ...(turn.via ? { via: turn.via } : {}), ...(turn.topic ? { topic: turn.topic } : {}) };
  return { ok: true, state: { ...state, turns: [...state.turns, next] } };
}

export const questionCount = (state: Pick<InterviewState, "turns">) => state.turns.filter((t) => t.role === "ai").length;

/** True while the AI may still ask a question: the interview is open, and neither the question limit nor the turn limit is reached. */
export function canAskMore(state: InterviewState): boolean {
  return state.status === "active" && questionCount(state) < INTERVIEW_LIMITS.questions && state.turns.length < INTERVIEW_LIMITS.turns - 1;
}

export function endInterview(state: InterviewState): InterviewState {
  return state.status === "active" ? { ...state, status: "ended" } : state;
}

/** The most recent turns, in order, for the AI request. */
export function turnsForPrompt(state: Pick<InterviewState, "turns">): Array<{ role: InterviewRole; text: string }> {
  return state.turns.slice(-INTERVIEW_LIMITS.promptTurns).map((t) => ({ role: t.role, text: t.text }));
}

const fold = (s: string) => s.toLowerCase().replace(/['’]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Is `quote` really something the PERSON said? Words the AI said do not count. Case and punctuation are ignored. */
export function quoteIsFromPerson(quote: string, turns: Array<{ role: InterviewRole; text: string }>): boolean {
  const q = fold(quote);
  if (q.length < 4) return false;
  return turns.some((t) => t.role === "person" && fold(t.text).includes(q));
}

export type InterviewStatement = { question: string; answer: string; via?: InterviewVia };

/** Each answer paired with the question it answered, in order. An answer with no question before it is not included. */
export function interviewStatements(state: Pick<InterviewState, "turns">): InterviewStatement[] {
  const out: InterviewStatement[] = [];
  let question: string | null = null;
  for (const t of state.turns) {
    if (t.role === "ai") question = t.text;
    else if (question) {
      out.push({ question, answer: t.text, ...(t.via ? { via: t.via } : {}) });
      question = null;
    }
  }
  return out;
}

/** How the screen should describe the interview's progress. */
export function interviewProgress(state: InterviewState): { asked: number; answered: number; max: number } {
  return { asked: questionCount(state), answered: state.turns.filter((t) => t.role === "person").length, max: INTERVIEW_LIMITS.questions };
}
