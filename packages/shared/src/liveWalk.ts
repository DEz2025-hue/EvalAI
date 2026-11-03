// Walking the checklist during a live session (decision D-023). Pure rules so they are tested without a phone.
// Moving between items never changes an answer: only a person's tap on a status does.

export type WalkItem = { id: string; title: string; instructions?: string };
export type WalkStatuses = Record<string, string | undefined>;

const UNCHECKED = (s: string | undefined) => !s || s === "not_checked";

/**
 * Where the walk begins: the "Start here" item from the site intake if it is still on the list, otherwise the first item
 * that is Not Checked, otherwise the first item. -1 when there is nothing to walk.
 */
export function startIndex(items: WalkItem[], statuses: WalkStatuses, startHereId?: string | null): number {
  if (items.length === 0) return -1;
  if (startHereId) {
    const i = items.findIndex((it) => it.id === startHereId);
    if (i >= 0) return i;
  }
  const first = items.findIndex((it) => UNCHECKED(statuses[it.id]));
  return first >= 0 ? first : 0;
}

/** Next or previous position, stopping at the ends (no wrapping). */
export function stepIndex(count: number, from: number, dir: 1 | -1): number {
  if (count <= 0) return -1;
  return Math.min(count - 1, Math.max(0, from + dir));
}

/** How many items have an answer (anything but Not Checked). */
export function walkProgress(items: WalkItem[], statuses: WalkStatuses): { marked: number; total: number } {
  return { marked: items.filter((it) => !UNCHECKED(statuses[it.id])).length, total: items.length };
}

export type WalkSummaryRow = { id: string; title: string; status: string; pictures: number; pieces: number };

/** One row per item for the finish screen: its status, how many pictures and narration pieces were linked to it. */
export function summarizeWalk(args: { items: WalkItem[]; statuses: WalkStatuses; picturesByItem: Record<string, number>; piecesByItem: Record<string, number> }): { rows: WalkSummaryRow[]; unmarked: string[]; extraPictures: number; extraPieces: number } {
  const rows = args.items.map((it) => ({ id: it.id, title: it.title, status: args.statuses[it.id] ?? "not_checked", pictures: args.picturesByItem[it.id] ?? 0, pieces: args.piecesByItem[it.id] ?? 0 }));
  const known = new Set(args.items.map((i) => i.id));
  const sumOutside = (m: Record<string, number>) => Object.entries(m).filter(([id]) => !known.has(id)).reduce((n, [, c]) => n + c, 0);
  return {
    rows,
    unmarked: rows.filter((r) => UNCHECKED(r.status)).map((r) => r.title),
    // Pictures and narration not tied to an item on the list (for example a session on the whole job).
    extraPictures: sumOutside(args.picturesByItem),
    extraPieces: sumOutside(args.piecesByItem),
  };
}
