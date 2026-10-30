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

/** Human-written sections of a report. Edited on a DRAFT only; frozen at finalize. */
export type ReportNarrative = {
  summary?: string;
  recommendations?: string;
  notes?: string;
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

export type ReportInput = {
  siteName: string;
  mode: "assessment" | "inspection";
  pack: "solar" | "cctv";
  context: Record<string, unknown>;
  checklist: Array<{ title: string; status: string; notes?: string }>;
  findings: ReportFinding[];
  measurements: Array<{ name: string; value: number; unit: string }>;
  materials?: Array<{ description: string; quantity: number; unit: string; rationale: string; provisional?: boolean }>;
  quotation?: { supplier: string; total: number; currency: string } | null;
  limitations: string[];
  narrative?: ReportNarrative;
};

/** Printed on every report so it is never mistaken for a certification or an automated verdict. */
export const REPORT_DISCLAIMER =
  "This report records what was observed, measured and reviewed by the people named in the version history. It is not a certification or a statement of compliance. AI-generated content is a draft that must be verified by a qualified person before reliance. Anything marked unconfirmed, provisional or not checked has not been verified.";
