// Deterministic completeness review — pure function so web, mobile, API and the finalize gate agree.

export type CompletenessTarget = "checklist" | "findings" | "materials" | "clarify" | "evidence";

export type CompletenessIssue = { code: string; reason: string; target: CompletenessTarget };

export type CompletenessInput = {
  items: Array<{ id: string; title: string; required: boolean }>;
  responses: Array<{ itemId: string; status: string; measuredValue?: number | null }>;
  /** item_id of every evidence row that is linked to a checklist item. */
  evidenceItemIds: string[];
  findings: Array<{ status: string }>;
  /** null = no materials list at all (allowed: a report may omit materials). */
  materials: { count: number; provisionalCount: number } | null;
  quotations: Array<{ stale: boolean }>;
  clarificationAnswered: boolean;
};

export type CompletenessResult = {
  total: number;
  counts: { pass: number; fail: number; needs_attention: number; not_applicable: number; not_checked: number };
  ready: boolean;
  blockers: CompletenessIssue[];
  warnings: CompletenessIssue[];
};

const num = (n: number) => String(n);

export function computeCompleteness(input: CompletenessInput): CompletenessResult {
  const byItem = new Map(input.responses.map((r) => [r.itemId, r]));
  const linked = new Set(input.evidenceItemIds);
  const counts = { pass: 0, fail: 0, needs_attention: 0, not_applicable: 0, not_checked: 0 };
  const blockers: CompletenessIssue[] = [];
  const warnings: CompletenessIssue[] = [];
  let passWithoutEvidence = 0;

  input.items.forEach((it, idx) => {
    const r = byItem.get(it.id);
    const status = (r?.status ?? "not_checked") as keyof typeof counts;
    if (status in counts) counts[status]++; else counts.not_checked++;
    const label = `Item ${idx + 1} "${it.title}"`;

    if (status === "not_checked") {
      if (it.required) blockers.push({ code: "required_not_checked", reason: `${label} is required and still Not Checked`, target: "checklist" });
      else warnings.push({ code: "optional_not_checked", reason: `${label} was not checked`, target: "checklist" });
    }
    if (status === "fail" || status === "needs_attention") {
      warnings.push({ code: "issue_flagged", reason: `${label} is flagged ${status === "fail" ? "Fail" : "Needs attention"} — make sure a finding and evidence cover it`, target: "findings" });
    }
    if (status === "pass" && it.required && !linked.has(it.id)) passWithoutEvidence++;
    if (/measurement/i.test(it.title) && status !== "not_applicable" && status !== "not_checked" && (r?.measuredValue === undefined || r?.measuredValue === null)) {
      warnings.push({ code: "measurement_missing", reason: `${label} has no recorded measurement`, target: "checklist" });
    }
  });

  if (passWithoutEvidence > 0) {
    warnings.push({ code: "pass_without_evidence", reason: `${num(passWithoutEvidence)} required item(s) are marked Pass with no photo or file linked to them`, target: "evidence" });
  }

  const awaiting = input.findings.filter((f) => f.status === "needs_review").length;
  if (awaiting > 0) blockers.push({ code: "findings_unreviewed", reason: `${num(awaiting)} finding(s) still need review — confirm or reject them`, target: "findings" });

  if (!input.clarificationAnswered) {
    warnings.push({ code: "clarification_missing", reason: "Scope questions were never answered — conclusions may rest on assumptions", target: "clarify" });
  }

  if (input.materials === null || input.materials.count === 0) {
    warnings.push({ code: "no_materials", reason: "No materials list — the report can be produced without one", target: "materials" });
  } else if (input.materials.provisionalCount > 0) {
    warnings.push({ code: "provisional_materials", reason: `${num(input.materials.provisionalCount)} material line(s) are provisional — verify before procurement`, target: "materials" });
  }
  const stale = input.quotations.filter((q) => q.stale).length;
  if (stale > 0) warnings.push({ code: "stale_quotation", reason: `${num(stale)} quotation(s) are out of date against the latest materials list`, target: "materials" });

  return { total: input.items.length, counts, ready: blockers.length === 0, blockers, warnings };
}
