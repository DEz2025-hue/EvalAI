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
};

export type ReportInput = {
  siteName: string;
  mode: "assessment" | "inspection";
  pack: "solar" | "cctv";
  context: Record<string, unknown>;
  checklist: Array<{ title: string; status: string; notes?: string }>;
  findings: Array<{ title: string; severity?: string }>;
  measurements: Array<{ name: string; value: number; unit: string }>;
  materials?: Array<{ description: string; quantity: number; unit: string; rationale: string; provisional?: boolean }>;
  quotation?: { supplier: string; total: number; currency: string } | null;
  limitations: string[];
};
