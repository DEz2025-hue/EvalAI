import { z } from "zod";
import { answerConcerns } from "./itemFields";

export const ChecklistStatus = z.enum(["pass", "fail", "needs_attention", "not_applicable", "not_checked"]);
export type ChecklistStatus = z.infer<typeof ChecklistStatus>;

export const ChecklistItem = z.object({
  id: z.string(),
  title: z.string().min(1),
  instructions: z.string().optional(),
  required: z.boolean().default(true),
  order: z.number(),
  category: z.string().optional(),
});
export type ChecklistItem = z.infer<typeof ChecklistItem>;

export const ChecklistResponse = z.object({
  itemId: z.string(),
  status: ChecklistStatus,
  notes: z.string().optional(),
  measuredValue: z.number().optional(),
  measuredUnit: z.string().optional(),
  /** Answers to the item's simple fields (D-042). */
  answers: z.record(z.union([z.string(), z.number()])).optional(),
  evidenceIds: z.array(z.string()).default([]),
});
export type ChecklistResponse = z.infer<typeof ChecklistResponse>;

/**
 * Rules every saved answer must meet, shared by the API and the screens so they agree. Returns the problem, or null.
 * A measured value needs its unit, and Not Applicable on a required item needs a reason in the notes.
 */
export function responseProblem(r: { status: string; notes?: string | null; measuredValue?: number | null; measuredUnit?: string | null; answers?: unknown }, item: { title: string; required: boolean }): string | null {
  if (r.measuredValue !== undefined && r.measuredValue !== null && !(r.measuredUnit ?? "").trim()) {
    return `"${item.title}": add a unit for the measured value (for example m, kW, V).`;
  }
  if (r.status === "not_applicable" && item.required && !(r.notes ?? "").trim()) {
    return `"${item.title}" is required: Not Applicable needs a reason in the notes.`;
  }
  // Pass means nothing is left to deal with, so it cannot sit beside an answer that says otherwise (D-042).
  const concern = r.status === "pass" ? answerConcerns(item.title, r.answers)[0] : undefined;
  if (concern) return `"${item.title}" can't be Pass while ${concern.label} is "${concern.value}". Use Needs Attention, or change that answer.`;
  return null;
}

/** Read a typed measurement. Accepts a decimal comma; returns undefined for empty or unfinished input like "-" or ".". */
export function parseMeasurement(text: string): number | undefined {
  const t = text.trim().replace(",", ".");
  if (!t || t === "-" || t === "." || t === "-.") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

const STATUS_LABELS: Record<ChecklistStatus, string> = {
  pass: "Pass",
  fail: "Issue found",
  needs_attention: "Needs attention",
  not_applicable: "Not applicable",
  not_checked: "Not Checked",
};

/** Plain-language result for a stored status code (reports and screens show this, never `needs_attention`). */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status as ChecklistStatus] ?? STATUS_LABELS.not_checked;
}

export function isPass(status: ChecklistStatus) { return status === "pass"; }
export function isChecked(status: ChecklistStatus) { return status !== "not_checked"; }
