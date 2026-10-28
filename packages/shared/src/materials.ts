import { z } from "zod";

export const MaterialItem = z.object({
  id: z.string(),
  description: z.string(),
  specification: z.string().optional(),
  quantity: z.number(),
  unit: z.string(),
  rationale: z.string(), // traceable source
  source: z.enum(["measurement", "finding", "rule", "user_input"]),
  provisional: z.boolean().default(false),
  assumptions: z.array(z.string()).default([]),
  findingId: z.string().optional(),
});
export type MaterialItem = z.infer<typeof MaterialItem>;
