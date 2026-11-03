import type { ReportPhoto } from "./report";

// Problem highlights on report photos (D-041): SAM 3.1 outlines the thing an AI photo review said a person should check. An outline shows WHERE to look.
// It is not a finding or a measurement, and it says nothing about whether the problem is real, so every report prints it as unverified.

/** One outlined area, as shares of the picture (0 to 1), so it fits any copy of the photo. `label` is the possible issue it belongs to. */
export type PhotoHighlight = { label: string; x: number; y: number; w: number; h: number; c?: number };

export const HIGHLIGHT_LIMITS = {
  /** SAM returns every match, however unsure. Below this the outlines were mostly wrong guesses. */
  minConfidence: 0.5,
  /** An outline covering most of the picture points at nothing ("wall" took 76% of a real photo). */
  maxAreaShare: 0.6,
  /** Specks: a vague phrase like "stain" returned a dozen of these on a real photo. */
  minAreaShare: 0.001,
  boxesPerIssue: 2,
  issuesPerPhoto: 3,
  label: 360,
} as const;

type Box = { x1: number; y1: number; x2: number; y2: number; w: number; h: number; c?: number };

/** Turn SAM's boxes for one possible issue into highlights: confident matches first, a few at most, none that cover the whole picture. */
export function highlightsFromBoxes(label: string, boxes: Box[]): PhotoHighlight[] {
  return boxes
    .filter((b) => (b.c ?? 0) >= HIGHLIGHT_LIMITS.minConfidence && b.w > 0 && b.h > 0)
    .map((b) => ({ label: label.slice(0, HIGHLIGHT_LIMITS.label), x: b.x1 / b.w, y: b.y1 / b.h, w: (b.x2 - b.x1 + 1) / b.w, h: (b.y2 - b.y1 + 1) / b.h, ...(b.c !== undefined ? { c: b.c } : {}) }))
    .filter((h) => h.w * h.h <= HIGHLIGHT_LIMITS.maxAreaShare && h.w * h.h >= HIGHLIGHT_LIMITS.minAreaShare)
    .sort((a, b) => (b.c ?? 0) - (a.c ?? 0))
    .slice(0, HIGHLIGHT_LIMITS.boxesPerIssue);
}

const share = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);

/** A report's stored highlights are drawn into HTML and a PDF, so anything that is not a plain area inside the picture is dropped. */
export function cleanHighlights(raw: unknown): PhotoHighlight[] {
  const out: PhotoHighlight[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const [x, y, w, h] = [share(o.x), share(o.y), share(o.w), share(o.h)];
    const label = typeof o.label === "string" ? o.label.trim().slice(0, HIGHLIGHT_LIMITS.label) : "";
    if (x === null || y === null || w === null || h === null || !w || !h || !label) continue;
    out.push({ label, x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) });
  }
  return out;
}

/** The highlights of a photo grouped by possible issue, each with the letter printed on its outlines. */
export function highlightGroups(photo: Pick<ReportPhoto, "highlights">): Array<{ letter: string; label: string; areas: PhotoHighlight[] }> {
  const groups: Array<{ letter: string; label: string; areas: PhotoHighlight[] }> = [];
  for (const h of cleanHighlights(photo.highlights)) {
    const group = groups.find((g) => g.label === h.label);
    if (group) group.areas.push(h);
    else groups.push({ letter: String.fromCharCode(65 + (groups.length % 26)), label: h.label, areas: [h] });
  }
  return groups;
}

/** Printed under a photo with highlights. */
export const HIGHLIGHT_NOTE = "Marked by AI to show where to look. Not verified, not a finding and not a measurement.";
