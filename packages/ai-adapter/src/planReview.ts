import { z } from "zod";
import { getAdapterConfig, type AdapterConfig } from "./config";
import { AiAdapterError } from "./client";
import { situationHint } from "./situation";
import { chatJson, type CallOptions, type JsonSchema } from "./chat";
import { DraftReportInput } from "./schemas";
import { SYSTEM_GUARD, compact } from "./text";
import { findUnverifiedFigures } from "./figures";
import { capText } from "./keyFindings";

// The senior review (D-039): Muse Wonder reads the whole record and the draft as a lead engineer would. It looks for what the checklist results hide
// (a Pass whose note says the thing is missing, a note the photos disagree with, two answers that conflict) and turns the job into a phased project
// plan. It never changes a checklist result. Every hold must name a real source; one that does not is dropped and the person is told.

export const PLAN_REVIEW_PROMPT =
  " You are the lead engineer reviewing a site report before it goes to the client, then planning how the project should run. You are given the technician's saved record and the draft write-up. " +
  "holds: what must be settled before the work can safely go ahead, most serious first. Look hard for what the checklist results hide: " +
  "a Pass or Not applicable whose note shows the thing is missing, unmeasured or unsafe (a Pass only means the item was looked at); a note that the photo notes disagree with; two answers that conflict with each other; a required measurement that does not exist; a stated goal the recorded site cannot yet support. " +
  "For each hold give title; priority (high = safety or blocks the work; medium = must be confirmed before design or purchase); why (state the conflict or gap plainly, quoting what the record says on each side, and why it matters); action (one concrete step, for a named role); and its sources: item_titles (the checklist items it rests on, always at least one when any item touches the subject) and photo_numbers. Every hold needs a source: one with none is thrown away. Do not list routine next steps as holds. Return no hold when the record shows no such problem. " +
  "phases: four to eight phases in the order the work must happen, specific to THIS job, from closing the gaps through to handover. Each has name; goal; tasks (short, concrete, naming this site's actual equipment, rooms and open questions rather than generic wording); owner (a role, never a person's name); done_when (the evidence that shows it is finished); hold_point (true when the next phase must not start until a qualified person has signed this one off). Every high-priority hold must be closed by a task in an early phase. Safety work comes before design, and design before purchase. " +
  "Rules: use only site facts from the record. Never invent a measurement, size, count, price, date or duration, and give no timeline. Do not name standards, codes or clause numbers, and do not use the words 'compliance', 'compliant' or 'complies'. " +
  "photoNotes are UNVERIFIED AI descriptions: you may raise a conflict with them ('Photo 2 appears to show'), and a person must check it. Never restate a checklist result as different from what was recorded. Plain professional third-person language.";

const OVERLOADED = new Set([429, 503]);
const str = { type: "string" } as const;
const strArray = { type: "array", items: str, maxItems: 12 } as const;

/** `titles` limits item_titles to the job's real checklist titles, because a retyped title cannot be matched and its hold would be lost. */
export function planReviewSchema(titles: string[] = []): JsonSchema {
  return {
    type: "object",
    properties: {
      holds: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          properties: { title: str, priority: { type: "string", enum: ["high", "medium"] }, why: str, action: str, item_titles: { type: "array", items: titles.length ? { type: "string", enum: titles } : str, maxItems: 12 }, photo_numbers: { type: "array", items: { type: "integer" }, maxItems: 12 } },
          required: ["title", "priority", "why", "action", "item_titles", "photo_numbers"],
          additionalProperties: false,
        },
      },
      phases: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          properties: { name: str, goal: str, tasks: strArray, owner: str, done_when: str, hold_point: { type: "boolean" } },
          required: ["name", "goal", "tasks", "owner", "done_when", "hold_point"],
          additionalProperties: false,
        },
      },
    },
    required: ["holds", "phases"],
    additionalProperties: false,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const blank = (s: unknown) => (typeof s === "string" ? s.trim() : "");

/** Keeps only holds with a complete text and at least one source that really exists in the report. Unknown sources are removed. */
export function cleanHolds(raw: unknown, known: { items: string[]; photoIds: string[] }) {
  const items = new Map(known.items.map((t) => [norm(t), t]));
  const holds: Array<{ title: string; priority: "high" | "medium"; why: string; action: string; basis: Array<{ kind: "item" | "photo"; ref: string }> }> = [];
  const dropped: string[] = [];
  for (const r of Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : []) {
    const title = capText(blank(r?.title), 160);
    if (!title) continue;
    const basis: Array<{ kind: "item" | "photo"; ref: string }> = [];
    for (const t of Array.isArray(r.item_titles) ? r.item_titles : []) {
      const ref = items.get(norm(String(t)));
      if (ref && !basis.some((b) => b.kind === "item" && b.ref === ref)) basis.push({ kind: "item", ref });
    }
    for (const n of Array.isArray(r.photo_numbers) ? r.photo_numbers : []) {
      const ref = Number.isInteger(n) ? known.photoIds[Number(n) - 1] : undefined;
      if (ref && !basis.some((b) => b.kind === "photo" && b.ref === ref)) basis.push({ kind: "photo", ref });
    }
    const why = capText(blank(r.why), 800);
    const action = capText(blank(r.action), 500);
    if (!why || !action || basis.length === 0) {
      dropped.push(title);
      continue;
    }
    holds.push({ title, priority: r.priority === "high" ? "high" : "medium", why, action, basis: basis.slice(0, 12) });
  }
  return { holds, dropped };
}

/** Returned in the app's field names but NOT yet checked as a plan: the caller runs shared `cleanProjectPlan`. */
export async function reviewAndPlan(input: z.input<typeof DraftReportInput>, draft: Record<string, unknown>, options?: CallOptions) {
  const v = DraftReportInput.parse(input);
  const photoNotes = v.photos.map((p, i) => ({ number: i + 1, itemTitle: p.itemTitle, caption: p.caption, observations: p.observations, possibleIssues: p.possibleIssues, cannotTell: p.cannotTell }));
  const facts = { siteBrief: v.siteBrief ?? {}, checklist: v.checklist, confirmedFindings: v.findings, measurements: v.measurements, limitations: v.limitations, materials: v.materials, photoNotes };
  const cfg = getAdapterConfig();
  const call = (config: AdapterConfig) => chatJson(
    config,
    "reviewPlan",
    {
      system: SYSTEM_GUARD + PLAN_REVIEW_PROMPT,
      user: JSON.stringify({
        task: "reviewAndPlan",
        siteName: v.siteName,
        pack: v.pack,
        situation: situationHint(v.scenario),
        goal: v.goal,
        siteBrief: compact(facts.siteBrief),
        checklist: compact(v.checklist),
        confirmedFindings: compact(v.findings),
        measurements: compact(v.measurements),
        limitations: compact(v.limitations),
        materials: compact(v.materials),
        photoNotes: compact(photoNotes),
        draft: compact(draft),
      }),
      schemaName: "plan_review",
      schema: planReviewSchema(v.checklist.map((c) => c.title)),
    },
    options,
  );
  // Muse Wonder is in preview and has answered "overloaded". A refusal comes back within seconds, so Muse Spark still fits inside the request's minute.
  const { data, model } = await call(cfg).catch((e: unknown) => {
    if (!(e instanceof AiAdapterError) || !OVERLOADED.has(e.status ?? 0) || cfg.ops.reviewPlan.model === cfg.ops.draftReport.model) throw e;
    return call({ ...cfg, ops: { ...cfg.ops, reviewPlan: { ...cfg.ops.reviewPlan, model: cfg.ops.draftReport.model } } });
  });
  const raw = data as Record<string, unknown>;
  const phases = (Array.isArray(raw.phases) ? (raw.phases as Array<Record<string, unknown>>) : []).map((p) => ({ name: p.name, goal: p.goal, tasks: p.tasks, owner: p.owner, doneWhen: p.done_when, holdPoint: p.hold_point }));
  if (phases.length === 0) throw new AiAdapterError("The AI did not produce a project plan", "invalid_response");
  const { holds, dropped } = cleanHolds(raw.holds, { items: v.checklist.map((c) => c.title), photoIds: v.photos.map((p) => p.id ?? "") });
  const written = [...holds.flatMap((h) => [h.why, h.action]), ...phases.flatMap((p) => [p.goal, p.doneWhen, ...(Array.isArray(p.tasks) ? p.tasks : [])])].filter((t) => typeof t === "string").join("\n\n");
  const unverifiedFigures = findUnverifiedFigures(written, [facts, v.siteName, v.goal, draft]);
  return { holds, phases, model, droppedHolds: dropped, unverifiedFigures, requiresHumanReview: true as const };
}
