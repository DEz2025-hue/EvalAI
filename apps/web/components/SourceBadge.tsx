export type ItemSource = "established" | "user" | "ai_suggested";

const LABEL: Record<ItemSource, { text: string; cls: string; hint: string }> = {
  established: { text: "Pack requirement", cls: "bg-slate-50 text-slate-700 border border-slate-200", hint: "Part of the standard pack checklist" },
  user: { text: "Added by you", cls: "bg-sky-50 text-sky-800 border border-sky-200", hint: "Written or edited by a person on this job" },
  ai_suggested: { text: "AI suggestion — review", cls: "bg-amber-100 text-amber-800 border border-amber-200", hint: "Suggested by AI. It is not a requirement until you accept it" },
};

/** Where a checklist item came from — requirements, user input and AI suggestions are never blended. */
export function SourceBadge({ source }: { source?: ItemSource | string | null }): JSX.Element {
  const s = (source && source in LABEL ? source : "established") as ItemSource;
  const l = LABEL[s];
  return <span title={l.hint} className={`text-xs px-2 py-0.5 rounded-full ${l.cls}`}>{l.text}</span>;
}
