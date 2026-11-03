import { statusLabel } from "./checklist";
import { hasDesign } from "./design";
import { hasSolarDesign } from "./solarDesign";
import { FINDING_PRIORITIES, KEY_FINDING_LIMITS, type FindingPriority, type ReportChecklistRow, type ReportInput, type ReportKeyFinding, type ReportSiteBrief } from "./report";

// Deterministic summaries of the checklist, shared by the HTML report, the PDF, the phone preview and the AI input, so they
// all describe the job the same way. Nothing here interprets or invents: it counts and groups what was saved.

const FLAGGED = new Set(["fail", "needs_attention"]);

export type Glance = {
  total: number;
  /** Items with any result other than Not Checked. */
  checked: number;
  counts: { pass: number; fail: number; needs_attention: number; not_applicable: number; not_checked: number };
  /** Required items still Not Checked. */
  requiredOpen: ReportChecklistRow[];
  /** Items marked as an issue or needing attention. */
  flagged: ReportChecklistRow[];
};

export function checklistGlance(rows: ReportChecklistRow[]): Glance {
  const counts = { pass: 0, fail: 0, needs_attention: 0, not_applicable: 0, not_checked: 0 };
  const requiredOpen: ReportChecklistRow[] = [];
  const flagged: ReportChecklistRow[] = [];
  for (const r of rows) {
    const s = (r.status in counts ? r.status : "not_checked") as keyof typeof counts;
    counts[s] += 1;
    if (s === "not_checked" && r.required) requiredOpen.push(r);
    if (FLAGGED.has(s)) flagged.push(r);
  }
  return { total: rows.length, checked: rows.length - counts.not_checked, counts, requiredOpen, flagged };
}

/** "12 of 15 items checked: 9 Pass, 2 Issue found, 1 Needs attention. 2 required items are still Not Checked." */
export function glanceSentence(g: Glance): string {
  if (g.total === 0) return "No checklist items were recorded for this job.";
  const parts = (["pass", "fail", "needs_attention", "not_applicable"] as const).filter((k) => g.counts[k] > 0).map((k) => `${g.counts[k]} ${statusLabel(k)}`);
  let s = `${g.checked} of ${g.total} items checked${parts.length ? ": " + parts.join(", ") : ""}.`;
  if (g.requiredOpen.length > 0) s += ` ${g.requiredOpen.length} required item${g.requiredOpen.length === 1 ? " is" : "s are"} still Not Checked.`;
  return s;
}

/** Items grouped by category in the order the categories first appear. Items without one go under "General". */
export function groupByCategory(rows: ReportChecklistRow[]): Array<{ category: string; rows: ReportChecklistRow[] }> {
  const groups = new Map<string, ReportChecklistRow[]>();
  for (const r of rows) {
    const c = r.category?.trim() || "General";
    groups.set(c, [...(groups.get(c) ?? []), r]);
  }
  return [...groups].map(([category, list]) => ({ category, rows: list }));
}

// ---- Key findings: what the report is built around ----

export const PRIORITY_LABEL: Record<FindingPriority, string> = { high: "High priority", medium: "Medium priority", low: "Low priority", info: "For information" };
export const priorityRank = (p: FindingPriority): number => FINDING_PRIORITIES.indexOf(p);

const normTitle = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** "Photo 1" … by the order photos appear in the report. Findings cite photos by evidence id; readers see these numbers. */
export function photoNumbers(input: Pick<ReportInput, "photos">): Map<string, number> {
  return new Map((input.photos ?? []).map((p, i) => [p.evidenceId, i + 1]));
}

/**
 * Key findings built only from what is recorded, for reports with no written findings (no AI, or an AI that failed): the confirmed
 * findings, then every checklist item marked Issue found or Needs attention. No interpretation is added; "meaning" and "action" stay empty.
 */
export function buildKeyFindings(input: ReportInput): ReportKeyFinding[] {
  const out: ReportKeyFinding[] = [];
  const seen = new Set<string>();
  const level = (s?: string): FindingPriority => (s === "high" || s === "medium" || s === "low" ? s : "medium");
  for (const f of input.findings ?? []) {
    if ((f.status ?? "confirmed") !== "confirmed" || seen.has(normTitle(f.title))) continue;
    seen.add(normTitle(f.title));
    out.push({
      id: `c${out.length + 1}`,
      title: clip(f.title, KEY_FINDING_LIMITS.title),
      priority: level(f.severity),
      observed: clip([f.description, f.uncertainty ? `Uncertainty: ${f.uncertainty}` : ""].filter(Boolean).join(" "), KEY_FINDING_LIMITS.observed),
      meaning: "",
      action: "",
      basis: [{ kind: "finding", ref: f.title }],
      source: "person",
      confirmed: true,
      ...(typeof f.evidenceCount === "number" ? { evidenceCount: f.evidenceCount } : {}),
    });
  }
  for (const r of input.checklist ?? []) {
    if ((r.status !== "fail" && r.status !== "needs_attention") || seen.has(normTitle(r.title))) continue;
    seen.add(normTitle(r.title));
    const measured = r.measured && Number.isFinite(Number(r.measured.value)) ? ` Measured: ${r.measured.value} ${r.measured.unit}.` : "";
    out.push({
      id: `c${out.length + 1}`,
      title: clip(r.title, KEY_FINDING_LIMITS.title),
      priority: r.status === "fail" ? "high" : "medium",
      observed: clip((r.notes?.trim() || `Marked ${statusLabel(r.status)} with no note.`) + measured, KEY_FINDING_LIMITS.observed),
      meaning: "",
      action: "",
      basis: [{ kind: "item", ref: r.title }, ...(input.photos ?? []).filter((p) => p.itemTitle === r.title).map((p) => ({ kind: "photo" as const, ref: p.evidenceId }))],
      source: "person",
    });
  }
  return out.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

/**
 * Which layout a report uses: "solar" for a solar design proposal (D-036), "design" for a CCTV design proposal (D-034), "findings" (the written key findings, or ones built from the record)
 * or "legacy" for an older report whose observations and issues were written as free text and have no key findings.
 */
export function reportLayout(input: ReportInput): "solar" | "design" | "findings" | "legacy" {
  const n = input.narrative ?? {};
  if (hasSolarDesign(n.solar)) return "solar";
  if (hasDesign(n.design)) return "design";
  if (n.keyFindings?.length) return "findings";
  return (n.observations ?? "").trim() || (n.issues ?? "").trim() ? "legacy" : "findings";
}

/**
 * The findings a report shows: the saved ones if there are any, otherwise those built from the record. A confirmed finding (a person's
 * reviewed content) is never dropped: if the written findings do not cover it, it is added as its own entry.
 */
export function keyFindingsFor(input: ReportInput): ReportKeyFinding[] {
  const saved = input.narrative?.keyFindings;
  let list: ReportKeyFinding[];
  if (saved?.length) {
    const covered = new Set(saved.flatMap((f) => [normTitle(f.title), ...f.basis.filter((b) => b.kind === "finding").map((b) => normTitle(b.ref))]));
    const missing = buildKeyFindings({ ...input, checklist: [], photos: [] }).filter((f) => !covered.has(normTitle(f.title)));
    list = [...saved, ...missing.map((f, i) => ({ ...f, id: `c${i + 1}` }))];
  } else {
    list = buildKeyFindings(input);
  }
  return [...list].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

/** The recommended actions: each finding's action, highest priority first. Built from the findings, so nothing is written twice. */
export function recommendedActions(findings: ReportKeyFinding[]): Array<{ id: string; priority: FindingPriority; title: string; action: string }> {
  return findings
    .filter((f) => f.action.trim())
    .map((f) => ({ id: f.id, priority: f.priority, title: f.title, action: f.action.trim() }))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

/** Label/value pairs for the site section, skipping anything that was not saved. */
export function siteBriefLines(brief: ReportSiteBrief | undefined, goalFallback?: unknown): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: unknown) => {
    const v = typeof value === "string" ? value.trim() : "";
    if (v) out.push({ label, value: v });
  };
  add("Purpose of the job", brief?.goal ?? (typeof goalFallback === "string" ? goalFallback : undefined));
  add("Address", brief?.address);
  add("Existing equipment", brief?.existingEquipment);
  add("Constraints", brief?.constraints);
  add("Described at site intake", brief?.intakeText);
  if (brief?.intakeVisible?.length) add("Seen at intake", brief.intakeVisible.join("; "));
  if (brief?.intakeLimits?.length) add("Could not be told at intake", brief.intakeLimits.join("; "));
  return out;
}
