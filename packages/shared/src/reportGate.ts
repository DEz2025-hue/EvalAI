// Preview before download (decision D-024). A DRAFT report can be downloaded only after the person has looked at the finished
// document in its current form. Any change to the draft (edited text, a removed photo, a rebuild) makes the earlier look stale.
// This is a rule of the app's screens, not a server lock: the PDF is still produced on request.

import { NARRATIVE_SECTIONS, type ReportNarrative } from "./report";

export type GateSnapshot = {
  id: string;
  finalized: boolean;
  payload?: { narrative?: ReportNarrative; photos?: Array<{ evidenceId: string; highlights?: unknown[] }>; template?: unknown };
};

/** Small stable hash (djb2). Not security: it only has to change when the text changes. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Identifies one version of one draft: its id, its human-written text and which photos it holds. */
export function previewKey(s: GateSnapshot): string {
  const n = s.payload?.narrative ?? {};
  // Every written section counts: changing any of them means the person has not seen this exact version yet.
  return `${s.id}:${hash(JSON.stringify([NARRATIVE_SECTIONS.map(({ key }) => n[key] ?? ""), n.keyFindings ?? [], n.design ?? null, n.solar ?? null, n.projectPlan ?? null, (s.payload?.photos ?? []).map((p) => (p.highlights?.length ? [p.evidenceId, p.highlights] : p.evidenceId)), s.payload?.template ?? null]))}`;
}

export type DownloadGate = { locked: boolean; reason: string | null };

/** May the PDF be downloaded now? Finalized reports always; a draft only after this exact version was previewed. */
export function downloadGate(s: GateSnapshot | null | undefined, previewedKey: string | null | undefined): DownloadGate {
  if (!s) return { locked: true, reason: "Choose a report first." };
  if (s.finalized) return { locked: false, reason: null };
  if (previewedKey && previewedKey === previewKey(s)) return { locked: false, reason: null };
  return { locked: true, reason: previewedKey && previewedKey.startsWith(s.id + ":") ? "You changed the draft. Preview it again before downloading." : "Preview the report first, then download it." };
}
