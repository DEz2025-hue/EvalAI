export type AssessmentRow = {
  id: string;
  workspace_id: string;
  site_id: string | null;
  mode: "assessment" | "inspection";
  pack: "solar" | "cctv";
  status: "draft" | "in_progress" | "review" | "finalized";
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  sites?: { name: string; address: string | null } | null;
};
