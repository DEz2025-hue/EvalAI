// How a single-photo AI analysis (D-035) is shown on the web and the phone: the same wording on both, always marked as a suggestion.

export type PhotoAnalysis = {
  summary: string;
  fit?: "yes" | "partly" | "no" | "no_item";
  relevance?: string;
  betterItems?: string[];
  observations?: string[];
  readings?: Array<{ label: string; value: string }>;
  suggestions?: string[];
  possibleIssues?: string[];
  suggestedNote?: string;
  limitations?: string[];
  uncertainty?: string;
  /** The checklist item the photo was read for, if any. */
  itemTitle?: string | null;
};

const FIT_LINE: Record<string, (item: string) => string> = {
  yes: (item) => `Useful for "${item}".`,
  partly: (item) => `Partly useful for "${item}".`,
  no: (item) => `Does not show what "${item}" asks for.`,
};

/** One line on whether the photo fits its item, and where else it would fit. Empty when the photo is not linked to an item. */
export function photoFitLine(a: PhotoAnalysis): string {
  const parts: string[] = [];
  if (a.itemTitle && a.fit && FIT_LINE[a.fit]) parts.push(FIT_LINE[a.fit](a.itemTitle));
  if (a.betterItems?.length) parts.push(`Better for: ${a.betterItems.join(", ")}.`);
  return parts.join(" ");
}

/** The whole analysis as plain text, in reading order (for the phone's banner and anywhere text is enough). */
export function photoAnalysisText(a: PhotoAnalysis): string {
  const list = (title: string, items?: string[]) => (items?.length ? `${title}:\n${items.map((i) => "• " + i).join("\n")}` : "");
  return [
    photoFitLine(a),
    a.summary,
    a.relevance ?? "",
    a.readings?.length ? `Label readings (as printed, not verified):\n${a.readings.map((r) => `• ${r.label ? r.label + ": " : ""}${r.value}`).join("\n")}` : "",
    list("Seen", a.observations),
    list("Suggestions (confirm on site)", a.suggestions),
    list("Worth checking", a.possibleIssues),
    a.suggestedNote ? `Suggested note: ${a.suggestedNote}` : "",
    a.limitations?.length ? `Limits: ${a.limitations.join("; ")}` : "",
    a.uncertainty ? `Confidence: ${a.uncertainty === "low" ? "high" : a.uncertainty === "high" ? "low" : "medium"}` : "",
  ]
    .filter((s) => s.trim())
    .join("\n\n");
}
