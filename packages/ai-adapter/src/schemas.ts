import { z } from "zod";

// Shared schema primitives — validate at every trust boundary (ARCHITECTURE.md §5, SECURITY.md §5)

export const EvidenceRef = z.object({
  id: z.string(),
  storageKey: z.string().optional(),
  mimeType: z.string().optional(),
});

export const ClarifyContextInput = z.object({
  workspaceId: z.string().min(1).max(100),
  assessmentId: z.string().min(1).max(100).optional(),
  mode: z.enum(["assessment", "inspection"]),
  pack: z.enum(["solar", "cctv"]),
  context: z.record(z.unknown()).default({}),
  existingChecklist: z.array(z.object({ title: z.string() })).optional(),
});

export const ClarifyContextOutput = z.object({
  questions: z.array(z.object({
    id: z.string(),
    question: z.string(),
    required: z.boolean().default(false),
    type: z.enum(["text", "number", "select", "boolean"]).default("text"),
    options: z.array(z.string()).optional(),
    rationale: z.string().optional(),
  })),
  missingCritical: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
});

export const ProposeChecklistInput = z.object({
  workspaceId: z.string().min(1).max(100),
  assessmentId: z.string().uuid().optional(),
  mode: z.enum(["assessment", "inspection"]),
  pack: z.enum(["solar", "cctv"]),
  context: z.record(z.unknown()),
  answers: z.record(z.unknown()).optional(),
  /** Titles already on the checklist, so suggestions only add what is missing. */
  existingChecklist: z.array(z.object({ title: z.string() })).optional(),
  maxItems: z.number().min(5).max(50).default(20),
});

export const ProposeChecklistOutput = z.object({
  items: z.array(z.object({
    title: z.string().min(3),
    instructions: z.string().optional(),
    required: z.boolean().default(true),
    category: z.string().optional(),
    rationale: z.string().optional(),
    source: z.enum(["template", "ai_suggested"]).default("ai_suggested"),
  })),
  warnings: z.array(z.string()).default([]),
});

export const AnalyzeAssessmentInput = z.object({
  workspaceId: z.string().min(1).max(100),
  assessmentId: z.string().min(1).max(100),
  checklistResponses: z.array(z.object({
    itemId: z.string(),
    title: z.string(),
    status: z.enum(["pass", "fail", "needs_attention", "not_applicable", "not_checked"]),
    notes: z.string().optional(),
    measuredValue: z.number().optional(),
    measuredUnit: z.string().optional(),
  })),
  evidenceRefs: z.array(z.string()).default([]),
  mode: z.enum(["assessment", "inspection"]),
  pack: z.enum(["solar", "cctv"]),
});

export const FindingDraft = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  severity: z.enum(["low", "medium", "high"]).optional(),
  evidenceRefs: z.array(z.string()).default([]),
  requiresHumanReview: z.boolean().default(true),
  uncertainty: z.enum(["low", "medium", "high"]).default("medium"),
  missingInputs: z.array(z.string()).default([]),
});

// Evidence-ref validation — ensure refs point to real evidence for the assessment (no fabricated IDs)
export function validateEvidenceRefs(refs: string[], knownEvidenceIds: string[]): { valid: string[]; invalid: string[] } {
  const known = new Set(knownEvidenceIds);
  const valid = refs.filter((r) => known.has(r));
  const invalid = refs.filter((r) => !known.has(r));
  return { valid, invalid };
}

export const AnalyzeAssessmentOutput = z.object({
  summary: z.string(),
  observations: z.array(z.string()).default([]),
  potentialFindings: z.array(FindingDraft).default([]),
  recommendations: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  uncertainty: z.enum(["low", "medium", "high"]).default("medium"),
  evidenceReferences: z.array(z.string()).default([]),
  requiresHumanReview: z.boolean().default(true),
});

/** Muse Voice Transcribe accepts ONLY mono 16-bit PCM WAV at 16 or 24 kHz (≤10 min, ≤32 MB). Convert other formats first. */
export const TranscribeAudioInput = z.object({
  audioBase64: z.string().min(1),
  /** Domain terms to bias recognition toward (not a guarantee of spelling). */
  keywords: z.array(z.string().min(1).max(60)).max(100).optional(),
  /** Language names, e.g. ["English", "French"]. Omit to auto-detect. */
  languageBias: z.array(z.string().min(2).max(40)).max(5).optional(),
});

export const TranscribeAudioOutput = z.object({
  transcript: z.string(),
  isUnconfirmed: z.boolean().default(true),
  durationSec: z.number().optional(),
  turnCount: z.number().optional(),
});

export const DraftReportInput = z.object({
  workspaceId: z.string().min(1).max(100),
  assessmentId: z.string().min(1).max(100),
  siteName: z.string().max(200),
  mode: z.enum(["assessment", "inspection"]),
  pack: z.enum(["solar", "cctv"]),
  goal: z.string().max(1000).optional(),
  checklist: z.array(z.object({ title: z.string(), status: z.string(), notes: z.string().optional() })).max(300),
  findings: z.array(z.object({ title: z.string(), severity: z.string().optional(), description: z.string().optional(), uncertainty: z.string().optional() })).max(50),
  measurements: z.array(z.object({ name: z.string(), value: z.number(), unit: z.string() })).max(100),
  limitations: z.array(z.string()).max(50),
});

export const DraftReportOutput = z.object({
  summary: z.string(),
  recommendations: z.string(),
  missingInformation: z.array(z.string()).default([]),
  requiresHumanReview: z.literal(true).default(true),
});

export const AnalyzeImageInput = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/jpeg"),
  prompt: z.string().optional(),
  assessmentContext: z.record(z.unknown()).optional(),
});

export const AnalyzeImageOutput = z.object({
  summary: z.string(),
  observations: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  uncertainty: z.enum(["low", "medium", "high"]).default("high"),
  evidenceRef: z.string().optional(),
  requiresHumanReview: z.boolean().default(true),
});
