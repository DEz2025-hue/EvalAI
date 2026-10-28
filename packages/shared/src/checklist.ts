import { z } from "zod";

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
  evidenceIds: z.array(z.string()).default([]),
});
export type ChecklistResponse = z.infer<typeof ChecklistResponse>;

export function isPass(status: ChecklistStatus) { return status === "pass"; }
export function isChecked(status: ChecklistStatus) { return status !== "not_checked"; }
