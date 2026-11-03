// Cleaning what the model returns for a report (D-027/D-028). The model is asked to combine the record into key findings, each with
// its sources. Nothing it returns is trusted as it comes: sources are checked against the real report content, incomplete findings are
// dropped, repeats are removed, and text is cut to the limits the report editor and the save route accept.

export type DraftPriority = "high" | "medium" | "low" | "info";
export type DraftBasis = { kind: "item" | "photo" | "measurement" | "finding"; ref: string };
export type DraftKeyFinding = { title: string; priority: DraftPriority; observed: string; meaning: string; action: string; basis: DraftBasis[] };

/** Same limits as KEY_FINDING_LIMITS in packages/shared (a web test keeps the two equal). `max` is lower here: a report reads best with a few strong findings. */
export const DRAFT_FINDING_LIMITS = { max: 12, title: 160, observed: 1500, meaning: 1500, action: 800, basis: 12 } as const;

/** What the report really contains, so a source the model names can be checked. */
export type KnownRefs = {
  items: string[];
  /** Photo evidence ids in report order: "Photo 1" is photoIds[0]. */
  photoIds: string[];
  measurements: string[];
  findings: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Cut text to `max` characters at the end of a paragraph or sentence, never in the middle of a word. */
export function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const cut = Math.max(head.lastIndexOf("\n\n"), head.lastIndexOf(". "), head.lastIndexOf(".\n"));
  return (cut > max * 0.5 ? head.slice(0, cut + 1) : head.slice(0, head.lastIndexOf(" "))).trim();
}

/** Sentences of a text, for finding repeats. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const plain = (s: string) => norm(s).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => new Set(plain(s).split(" ").filter((w) => w.length > 2));

/** True when two sentences say the same thing: identical apart from case and punctuation, or at least 80% of their words shared (for sentences of 6+ words). */
export function sameSentence(a: string, b: string): boolean {
  if (plain(a) === plain(b)) return true;
  const wa = words(a);
  const wb = words(b);
  if (wa.size < 6 || wb.size < 6) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size) >= 0.8;
}

/**
 * Removes from `text` every sentence that repeats one in `seen`, so a summary or list of open items does not re-tell what a finding already
 * says. If every sentence is a repeat the original is kept: a repeated summary beats an empty one.
 */
export function withoutRepeats(text: string, seen: string[]): string {
  if (!text.trim()) return text;
  const kept = text.split(/\n{2,}/).map((para) => sentencesOf(para).filter((s) => !seen.some((t) => sameSentence(s, t))).join(" ")).filter(Boolean).join("\n\n");
  return kept.trim() ? kept : text;
}

const PRIORITIES = new Set(["high", "medium", "low", "info"]);
const RANK: Record<DraftPriority, number> = { high: 0, medium: 1, low: 2, info: 3 };

/**
 * Turn the model's `key_findings` into clean findings. A finding is kept only if it has a title, what was observed, what it means and an
 * action, and (unless it is only "for information") at least one source that really exists in the report. Unknown sources are removed.
 * Returns the titles of findings that were dropped, so the person can be told.
 */
export function cleanKeyFindings(raw: unknown, known: KnownRefs): { findings: DraftKeyFinding[]; dropped: string[] } {
  const byNorm = (list: string[]) => new Map(list.map((x) => [norm(x), x]));
  const items = byNorm(known.items);
  const measurements = byNorm(known.measurements);
  const findings = byNorm(known.findings);
  const out: DraftKeyFinding[] = [];
  const dropped: string[] = [];
  const titles = new Set<string>();

  for (const r of Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : []) {
    const title = capText(str(r?.title), DRAFT_FINDING_LIMITS.title);
    if (!title) continue;
    const observed = capText(str(r.observed), DRAFT_FINDING_LIMITS.observed);
    const meaning = capText(str(r.meaning), DRAFT_FINDING_LIMITS.meaning);
    const action = capText(str(r.action), DRAFT_FINDING_LIMITS.action);
    const priority = (PRIORITIES.has(String(r.priority)) ? r.priority : "medium") as DraftPriority;

    const basis: DraftBasis[] = [];
    const add = (kind: DraftBasis["kind"], ref: string | undefined) => {
      if (ref && !basis.some((b) => b.kind === kind && b.ref === ref)) basis.push({ kind, ref });
    };
    for (const t of Array.isArray(r.item_titles) ? r.item_titles : []) add("item", items.get(norm(String(t))));
    for (const n of Array.isArray(r.photo_numbers) ? r.photo_numbers : []) add("photo", Number.isInteger(n) ? known.photoIds[Number(n) - 1] : undefined);
    for (const m of Array.isArray(r.measurement_names) ? r.measurement_names : []) add("measurement", measurements.get(norm(String(m))));
    for (const f of Array.isArray(r.finding_titles) ? r.finding_titles : []) add("finding", findings.get(norm(String(f))));

    const complete = observed && meaning && action;
    const sourced = basis.length > 0 || priority === "info";
    if (!complete || !sourced || titles.has(norm(title))) {
      dropped.push(title);
      continue;
    }
    titles.add(norm(title));
    out.push({ title, priority, observed, meaning, action, basis: basis.slice(0, DRAFT_FINDING_LIMITS.basis) });
    if (out.length >= DRAFT_FINDING_LIMITS.max) break;
  }
  return { findings: out.sort((a, b) => RANK[a.priority] - RANK[b.priority]), dropped };
}
