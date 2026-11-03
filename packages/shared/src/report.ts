import type { ReportTemplate } from "./reportTemplate";
import type { DesignProposal } from "./design";
import type { SolarDesign } from "./solarDesign";

export type ReportSnapshot = {
  id: string;
  assessmentId: string;
  assessmentVersion: number;
  checklistVersion: string;
  materialsVersionId?: string | null;
  materialsVersion?: number | null;
  quotationVersionId?: string | null;
  quotationVersion?: number | null;
  artifactKey?: string | null; // private storage key for PDF
  htmlPreview?: string; // deterministic HTML from saved facts
  createdAt: string;
  createdBy: string;
  finalized: boolean;
  immutable: true;
  /** Person who reviewed and signed off the report (set when a draft is finalized). */
  reviewedBy?: string | null;
  reviewedByLabel?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
};

/**
 * Written sections of a report (by a person, or drafted by an AI and edited by a person). Edited on a DRAFT only; frozen at
 * finalize. Every field is optional so older snapshots, which only have summary/recommendations/notes, still render.
 */
export type ReportNarrative = {
  /** Executive summary. */
  summary?: string;
  /** What the site is and what was assessed, in prose. */
  siteOverview?: string;
  /**
   * The key findings: related observations, measurements and photos combined into one technical finding each, with what it means
   * and what to do. The heart of the report; replaces the older free-text `observations` and `issues`.
   */
  keyFindings?: ReportKeyFinding[];
  /** Older reports only: what was found, by area, as free text. */
  observations?: string;
  /** Older reports only: problems and risks, as free text. */
  issues?: string;
  /** Extra recommendations the person adds (the recommended actions table is built from the key findings). */
  recommendations?: string;
  /** Unknowns, assumptions and what is still to be checked. */
  openItems?: string;
  /** Reviewer notes. */
  notes?: string;
  /**
   * A design proposal (D-034): for a new CCTV installation the report is a design (cameras, decisions, options, equipment) instead of
   * pass/fail findings. Drafted by the AI, edited and signed off by a person.
   */
  design?: DesignProposal;
  /** A solar design and sizing proposal (D-036): the loads, the sizing assumptions and the system that follows. Drafted by the AI, sized by code. */
  solar?: SolarDesign;
};

export const FINDING_PRIORITIES = ["high", "medium", "low", "info"] as const;
export type FindingPriority = (typeof FINDING_PRIORITIES)[number];

/** Where a statement in a key finding comes from. `ref` is the item title, photo (evidence) id, measurement name or finding title. */
export type ReportFindingBasis = { kind: "item" | "photo" | "measurement" | "finding"; ref: string };

/**
 * One technical finding in the report. `observed` holds what was recorded or seen (facts, with photo statements cited);
 * `meaning` is interpretation, which may use general trade knowledge and is the AI's reading until a person confirms the finding;
 * `action` is what to do next. Nothing in a key finding is a measurement or a compliance result.
 */
export type ReportKeyFinding = {
  id: string;
  title: string;
  priority: FindingPriority;
  observed: string;
  meaning: string;
  action: string;
  basis: ReportFindingBasis[];
  /** Who wrote it: drafted by the AI, or written by a person. */
  source: "ai" | "person";
  /** The person has checked this finding against the evidence. */
  confirmed?: boolean;
  /** For a confirmed finding: how many evidence items are linked to it. */
  evidenceCount?: number;
};

/** Limits for key findings, shared by the AI parser, the save route and the editors. */
export const KEY_FINDING_LIMITS = { max: 20, title: 160, observed: 1500, meaning: 1500, action: 800, basis: 12, ref: 200 } as const;

/** The written (text) sections of a narrative: everything except the key findings and the design. */
export type NarrativeTextKey = Exclude<keyof ReportNarrative, "keyFindings" | "design" | "solar">;

/** Narrative text fields in the order they appear in a report, with their editor labels. `legacy` fields are only shown for older reports. */
export const NARRATIVE_SECTIONS: Array<{ key: NarrativeTextKey; label: string; max: number; legacy?: boolean }> = [
  { key: "summary", label: "Executive summary", max: 5000 },
  { key: "siteOverview", label: "Site and scope", max: 5000 },
  { key: "recommendations", label: "Additional recommendations", max: 5000 },
  { key: "openItems", label: "Open items and limitations", max: 5000 },
  { key: "notes", label: "Reviewer notes", max: 5000 },
  { key: "observations", label: "What was found, by area (older report)", max: 8000, legacy: true },
  { key: "issues", label: "Issues and risks (older report)", max: 5000, legacy: true },
];

/** A checklist item as it appears in a report: the result, plus what the report needs to group and explain it. */
export type ReportChecklistRow = {
  title: string;
  status: string;
  notes?: string;
  /** Group the item belongs to (Site, System, Customer, …). */
  category?: string;
  required?: boolean;
  /** Item-level measurement entered while checking. */
  measured?: { value: number; unit: string };
  /** How many photos or files are linked to this item. */
  evidenceCount?: number;
};

/** Saved facts about the job itself: where, why and what was already known. Deterministic, built from stored data. */
export type ReportSiteBrief = {
  address?: string;
  goal?: string;
  existingEquipment?: string;
  constraints?: string;
  /** What the person described at site intake. */
  intakeText?: string;
  intakeVisible?: string[];
  intakeLimits?: string[];
  /** Scope questions that were answered. */
  answers?: Array<{ question: string; answer: string }>;
  /** What the person said in the site interview (D-030). Statements, not verified facts. Only set once the person has reviewed it. */
  interview?: ReportInterview;
};

export type ReportInterview = {
  /** Details the person accepted, each backed by their own words. */
  details: Array<{ label: string; value: string }>;
  /** The questions asked and the answers given. */
  statements: Array<{ question: string; answer: string }>;
  /** What the interview left unanswered. */
  openQuestions: string[];
};

export type ReportFinding = {
  title: string;
  severity?: string;
  description?: string;
  /** What is unknown or uncertain about this finding. */
  uncertainty?: string;
  /** Number of evidence items linked to the finding (traceability). */
  evidenceCount?: number;
  /** confirmed findings are reviewed by a person; anything else is shown as unconfirmed. */
  status?: string;
};

/**
 * A job photo as it appears in the report (decision D-022). Everything the AI said about it is UNVERIFIED: a description and
 * possible issues for a person to check, never a finding. A small copy of the picture is kept so a finalized report stays
 * complete even if the original is deleted later.
 */
export type ReportPhoto = {
  evidenceId: string;
  caption: string;
  /** The checklist item the photo was linked to, if any. */
  itemTitle?: string;
  observations: string[];
  possibleIssues: Array<{ text: string; confidence: "low" | "medium" | "high" }>;
  cannotTell: string[];
  /** Small JPEG as a data URI (data:image/jpeg;base64,…). */
  thumbnail?: string;
};

export type ReportInput = {
  siteName: string;
  mode: "assessment" | "inspection";
  pack: "solar" | "cctv";
  context: Record<string, unknown>;
  checklist: ReportChecklistRow[];
  /** Saved job facts (address, intake, scope answers). Absent on older snapshots. */
  siteBrief?: ReportSiteBrief;
  findings: ReportFinding[];
  measurements: Array<{ name: string; value: number; unit: string }>;
  /** `specification`, `source` and `quantityTbd` are only set when they apply (D-029), so reports saved before they existed keep the same content. */
  materials?: Array<{ description: string; quantity: number; unit: string; rationale: string; provisional?: boolean; specification?: string; source?: "ai_suggested"; quantityTbd?: boolean }>;
  quotation?: { supplier: string; total: number; currency: string } | null;
  limitations: string[];
  /** Photos with what the AI saw in them. Kept out of the "stored facts" check at sign-off: a reviewer can remove photos. */
  photos?: ReportPhoto[];
  narrative?: ReportNarrative;
  /** The office's report style as it was when this draft was made (D-031). A copy, so a finalized report never changes. Absent on older reports. */
  template?: ReportTemplate;
};

/** Printed on every report so it is never mistaken for a certification or an automated verdict. */
export const REPORT_DISCLAIMER =
  "This report records what was observed, measured and reviewed by the people named in the version history. It is not a certification or a statement of compliance. AI-generated content is a draft that must be verified by a qualified person before reliance. Anything marked unconfirmed, provisional or not checked has not been verified.";
