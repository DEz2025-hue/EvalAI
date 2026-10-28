import { z } from "zod";

export const CreateAssessmentSchema = z.object({
  mode: z.enum(["assessment", "inspection"]),
  pack: z.enum(["solar", "cctv"]),
  siteName: z.string().min(2).max(100),
  address: z.string().max(200).optional(),
  goal: z.string().max(500).optional(),
  existingEquipment: z.string().max(1000).optional(),
});

export const ChecklistStatusSchema = z.enum(["pass", "fail", "needs_attention", "not_applicable", "not_checked"]);

export const SaveResponseSchema = z.object({
  assessmentId: z.string().uuid(),
  itemId: z.string().uuid(),
  status: ChecklistStatusSchema,
  notes: z.string().max(2000).optional(),
  measuredValue: z.number().optional(),
  measuredUnit: z.string().max(20).optional(),
});

export const EvidenceUploadSchema = z.object({
  assessmentId: z.string().uuid(),
  itemId: z.string().uuid().optional(),
  mimeType: z.string(),
  sizeBytes: z.number().max(20 * 1024 * 1024), // 20MB limit
});
