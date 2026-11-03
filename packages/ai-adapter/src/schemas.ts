import { z } from "zod";
import { ScenarioField } from "./situation";

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
  scenario: ScenarioField,
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
  scenario: ScenarioField,
  context: z.record(z.unknown()),
  answers: z.record(z.unknown()).optional(),
  /** Everything already on the checklist (template items, typed items, earlier suggestions), with what each covers, so suggestions only add what is missing. */
  existingChecklist: z.array(z.object({ title: z.string(), covers: z.string().max(1000).optional(), category: z.string().max(100).optional() })).optional(),
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
  /** Suggestions left out because they repeat something already on the checklist. */
  skipped: z.array(z.object({ title: z.string(), duplicateOf: z.string() })).default([]),
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
  scenario: ScenarioField,
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
  scenario: ScenarioField,
  goal: z.string().max(1000).optional(),
  checklist: z
    .array(
      z.object({
        title: z.string(),
        status: z.string(),
        notes: z.string().optional(),
        category: z.string().max(100).optional(),
        required: z.boolean().optional(),
        /** What the item is about (the template's "look for" text). Guidance, never something that was observed. */
        covers: z.string().max(800).optional(),
        measured: z.object({ value: z.number(), unit: z.string().max(20) }).optional(),
        /** What the person answered in the item's simple fields (D-042). */
        answers: z.array(z.object({ label: z.string().max(160), value: z.string().max(160), concern: z.boolean().optional() })).max(20).optional(),
        /** Photos linked to this item. */
        evidenceCount: z.number().int().min(0).optional(),
      }),
    )
    .max(300),
  /** Confirmed findings only. */
  findings: z.array(z.object({ title: z.string(), severity: z.string().optional(), description: z.string().optional(), uncertainty: z.string().optional() })).max(50),
  /** How many findings still await a person's review. Their content is never sent. */
  findingsAwaitingReview: z.number().int().min(0).default(0),
  measurements: z.array(z.object({ name: z.string(), value: z.number(), unit: z.string() })).max(100),
  limitations: z.array(z.string()).max(50),
  /** Counted from the saved checklist, so the model quotes the numbers instead of counting. */
  glance: z
    .object({
      total: z.number().int().min(0),
      checked: z.number().int().min(0),
      pass: z.number().int().min(0),
      issue: z.number().int().min(0),
      needsAttention: z.number().int().min(0),
      notApplicable: z.number().int().min(0),
      notChecked: z.number().int().min(0),
      requiredNotChecked: z.number().int().min(0),
    })
    .optional(),
  /** Saved facts about the job: where, why, what was already known, what was described at intake, scope answers. */
  siteBrief: z
    .object({
      address: z.string().max(300).optional(),
      goal: z.string().max(1500).optional(),
      existingEquipment: z.string().max(1500).optional(),
      constraints: z.string().max(1500).optional(),
      intakeText: z.string().max(2000).optional(),
      intakeVisible: z.array(z.string().max(300)).max(8).optional(),
      intakeLimits: z.array(z.string().max(300)).max(6).optional(),
      answers: z.array(z.object({ question: z.string().max(300), answer: z.string().max(1000) })).max(30).optional(),
      /** What the person said in the site interview. Statements, not verified facts. */
      interview: z
        .object({
          details: z.array(z.object({ label: z.string().max(60), value: z.string().max(1500) })).max(8),
          statements: z.array(z.object({ question: z.string().max(300), answer: z.string().max(1500) })).max(12),
          openQuestions: z.array(z.string().max(300)).max(8),
        })
        .optional(),
    })
    .optional(),
  materials: z.array(z.object({ description: z.string(), quantity: z.number(), unit: z.string(), rationale: z.string(), provisional: z.boolean().optional() })).max(100).default([]),
  /** What an AI said about the job's photos (D-022). UNVERIFIED: it may be mentioned, never treated as a confirmed finding. */
  photos: z
    .array(
      z.object({
        /** The photo's evidence id. Findings cite photos by their number in this list; the id is how that number is turned back into the photo. */
        id: z.string().max(100).optional(),
        itemTitle: z.string().max(300).optional(),
        caption: z.string().max(500),
        observations: z.array(z.string().max(400)).max(10).default([]),
        possibleIssues: z.array(z.string().max(400)).max(6).default([]),
        cannotTell: z.array(z.string().max(300)).max(6).default([]),
      }),
    )
    .max(12)
    .default([]),
});

/** Stage 2: rewrite the summary and open items from the findings as the person has edited them. */
export const DraftSummaryInput = z.object({
  workspaceId: z.string().min(1).max(100),
  assessmentId: z.string().min(1).max(100),
  siteName: z.string().max(200),
  mode: z.enum(["assessment", "inspection"]),
  pack: z.enum(["solar", "cctv"]),
  scenario: ScenarioField,
  siteBrief: DraftReportInput.shape.siteBrief,
  glance: DraftReportInput.shape.glance,
  /** The findings as they stand now (the person's edits are authoritative). */
  keyFindings: z
    .array(z.object({ title: z.string().max(200), priority: z.enum(["high", "medium", "low", "info"]), observed: z.string().max(1600), meaning: z.string().max(1600), action: z.string().max(900) }))
    .max(20),
  limitations: z.array(z.string()).max(50),
  findingsAwaitingReview: z.number().int().min(0).default(0),
});

/** The documented rules, as data (from shared ruleCatalog). The model chooses among them; code does the arithmetic. */
export const MaterialRuleData = z.object({
  id: z.string(),
  label: z.string(),
  unit: z.string(),
  formula: z.string(),
  inputs: z.array(z.object({ name: z.string(), label: z.string(), unit: z.string(), kind: z.string(), default: z.number().optional(), min: z.number(), max: z.number() })),
});

export const ProposeMaterialsInput = z.object({
  workspaceId: z.string().min(1).max(100),
  assessmentId: z.string().min(1).max(100),
  siteName: z.string().max(200),
  mode: z.enum(["assessment", "inspection"]),
  pack: z.enum(["solar", "cctv"]),
  scenario: ScenarioField,
  goal: z.string().max(1000).optional(),
  checklist: DraftReportInput.shape.checklist,
  findings: DraftReportInput.shape.findings,
  findingsAwaitingReview: z.number().int().min(0).default(0),
  measurements: DraftReportInput.shape.measurements,
  limitations: z.array(z.string()).max(50),
  siteBrief: DraftReportInput.shape.siteBrief,
  photos: DraftReportInput.shape.photos,
  /** The list as it stands now, so the model does not repeat it. */
  existingMaterials: z.array(z.object({ description: z.string().max(300), specification: z.string().max(500).optional() })).max(100).default([]),
  rules: z.array(MaterialRuleData).max(30),
});

export const DraftReportOutput = z.object({
  summary: z.string(),
  siteOverview: z.string().default(""),
  /** Related observations, measurements and photos combined into technical findings; sources already checked against the report. */
  keyFindings: z
    .array(
      z.object({
        title: z.string(),
        priority: z.enum(["high", "medium", "low", "info"]),
        observed: z.string(),
        meaning: z.string(),
        action: z.string(),
        basis: z.array(z.object({ kind: z.enum(["item", "photo", "measurement", "finding"]), ref: z.string() })),
      }),
    )
    .default([]),
  /** Titles of findings the model wrote but that were left out (incomplete, or no real source). */
  droppedFindings: z.array(z.string()).default([]),
  openItems: z.string().default(""),
  missingInformation: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  /** Figures with a unit, % or currency in the text that are not in the facts the model was given. For the reviewer to check. */
  unverifiedFigures: z.array(z.string()).default([]),
  requiresHumanReview: z.literal(true).default(true),
});

/** The job a photo belongs to, assembled on the server from stored data (D-035). */
export const PhotoJobContext = z.object({
  pack: z.enum(["solar", "cctv"]),
  mode: z.enum(["assessment", "inspection"]),
  scenario: ScenarioField,
  siteName: z.string().max(200).optional(),
  goal: z.string().max(1500).optional(),
  /** Short facts about the site: address, existing equipment, constraints, what was described at intake, interview details. */
  siteBrief: z.record(z.unknown()).optional(),
  /** The checklist item the photo is linked to: what it asks for, and what the person has recorded so far. */
  item: z.object({ title: z.string().max(300), category: z.string().max(100).optional(), lookFor: z.string().max(1500).optional(), status: z.string().max(40).optional(), notes: z.string().max(2000).optional(), fields: z.array(z.object({ key: z.string().max(60), label: z.string().max(120), options: z.array(z.string().max(120)).max(12) })).max(12).optional() }).nullable().optional(),
  /** Titles of the job's other checklist items, so the model can say where a photo fits better. */
  otherItems: z.array(z.string().max(300)).max(200).default([]),
});
export type PhotoJobContext = z.infer<typeof PhotoJobContext>;

export const AnalyzeImageInput = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/jpeg"),
  /** Extra focus from the screen (for example the live camera). Untrusted text. */
  prompt: z.string().optional(),
  context: PhotoJobContext.optional(),
});

export const AnalyzeImageOutput = z.object({
  summary: z.string(),
  /** Does the photo show what its checklist item asks for? */
  fit: z.enum(["yes", "partly", "no", "no_item"]).default("no_item"),
  /** How the photo helps the item and the job, in a sentence or two. */
  relevance: z.string().default(""),
  /** Other checklist items (titles, exactly as given) this photo would answer better. */
  betterItems: z.array(z.string()).default([]),
  observations: z.array(z.string()).default([]),
  /** Text read from labels, nameplates and displays, quoted as printed. Readings, not verified measurements. */
  readings: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  /** What the photo suggests for the job (where panels look best, where a camera should go). To confirm on site. */
  suggestions: z.array(z.string()).default([]),
  possibleIssues: z.array(z.string()).default([]),
  /** A draft note the person can put on the checklist item. */
  suggestedNote: z.string().default(""),
  /** Choices the photo suggests for the item's simple fields (D-042). A person accepts each one. */
  fieldSuggestions: z.array(z.object({ key: z.string(), label: z.string(), value: z.string() })).default([]),
  limitations: z.array(z.string()).default([]),
  uncertainty: z.enum(["low", "medium", "high"]).default("high"),
  evidenceRef: z.string().optional(),
  requiresHumanReview: z.boolean().default(true),
});
