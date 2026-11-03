// Site intake (decision D-021): what the AI suggested after a description and photos, and how the person's choices are
// applied to the checklist. Pure functions so the rules are tested without a phone. Nothing here touches a checklist
// STATUS: intake only adds items and sharpens "what to look for" text.

export type IntakeStartHere = { itemId: string | null; title: string; reason: string };
export type IntakeNewItem = { title: string; lookFor: string; why: string; category: string | null };
export type IntakeGuidanceUpdate = { itemId: string; lookFor: string };

export type IntakeResult = {
  startHere: IntakeStartHere | null;
  newItems: IntakeNewItem[];
  guidanceUpdates: IntakeGuidanceUpdate[];
  visible: string[];
  limitations: string[];
  uncertainty: "low" | "medium" | "high";
};

export type IntakeMode = "auto" | "review";

/** The suggestions the person accepted: positions in newItems, and item ids from guidanceUpdates. */
export type IntakeChoice = { newItems: number[]; guidanceUpdates: string[] };

export type ChecklistItemLike = {
  id: string;
  title: string;
  instructions?: string;
  required: boolean;
  category?: string;
  source?: "established" | "user" | "ai_suggested";
  rationale?: string;
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Automatic mode: everything suggested is accepted. */
export function acceptAll(result: Pick<IntakeResult, "newItems" | "guidanceUpdates">): IntakeChoice {
  return { newItems: result.newItems.map((_, i) => i), guidanceUpdates: result.guidanceUpdates.map((u) => u.itemId) };
}

/**
 * Apply the accepted suggestions to a checklist. New items go at the end, marked as AI suggestions (so they show the
 * "AI suggestion — review" badge and can be removed); accepted guidance replaces the "look for" text of that item only.
 * Existing items keep their id, order, title, required flag and source. Titles already present are never added twice.
 */
export function mergeIntake(items: ChecklistItemLike[], result: IntakeResult, choice: IntakeChoice, idPrefix = `ai_${Date.now()}`): { items: ChecklistItemLike[]; added: number; updated: number } {
  const updates = new Map(result.guidanceUpdates.filter((u) => choice.guidanceUpdates.includes(u.itemId)).map((u) => [u.itemId, u.lookFor]));
  let updated = 0;
  const next = items.map((it) => {
    const look = updates.get(it.id);
    if (!look || look === it.instructions) return it;
    updated += 1;
    return { ...it, instructions: look };
  });
  const have = new Set(next.map((it) => norm(it.title)));
  let added = 0;
  choice.newItems.forEach((idx) => {
    const n = result.newItems[idx];
    if (!n || have.has(norm(n.title))) return;
    have.add(norm(n.title));
    next.push({ id: `${idPrefix}_${added}`, title: n.title, instructions: n.lookFor || undefined, required: false, category: n.category ?? "AI suggested", source: "ai_suggested", rationale: n.why || undefined });
    added += 1;
  });
  return { items: next, added, updated };
}

/** What is kept on the job (context.intake) so the guidance can be shown later: no photos, just the text and evidence ids. */
export type IntakeSummary = {
  at: string;
  mode: IntakeMode;
  description: string;
  startHere: IntakeStartHere | null;
  visible: string[];
  limitations: string[];
  evidenceIds: string[];
  added: number;
  updated: number;
};

export function buildIntakeSummary(args: { description: string; result: IntakeResult; mode: IntakeMode; evidenceIds: string[]; added: number; updated: number; now?: Date }): IntakeSummary {
  return {
    at: (args.now ?? new Date()).toISOString(),
    mode: args.mode,
    description: args.description.trim().slice(0, 2000),
    startHere: args.result.startHere,
    visible: args.result.visible.slice(0, 8),
    limitations: args.result.limitations.slice(0, 6),
    evidenceIds: args.evidenceIds.slice(0, 5),
    added: args.added,
    updated: args.updated,
  };
}

/** The item to show as "Start here": the stored one if it is still on the checklist, otherwise just its title. */
export function startHereFor(summary: Pick<IntakeSummary, "startHere"> | null | undefined, items: Array<{ id: string; title: string }>): { title: string; reason: string; itemId: string | null } | null {
  const s = summary?.startHere;
  if (!s) return null;
  const byId = s.itemId ? items.find((i) => i.id === s.itemId) : undefined;
  if (byId) return { title: byId.title, reason: s.reason, itemId: byId.id };
  return s.title ? { title: s.title, reason: s.reason, itemId: null } : null;
}
