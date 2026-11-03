// Finds AI checklist suggestions that repeat an item already on the checklist (a template item, one the person typed, or an earlier suggestion).
// Exact-title matching misses "Wiring and earthing check" against "Wiring, protection & earthing review", so titles are compared by the
// meaningful words they use, after stemming and mapping a few trade synonyms (wiring = cable, NVR = recorder). A suggestion is a repeat
// when all of its meaningful words are already used by one existing item's title, or (for longer titles) by what that item says it covers.
// It is a conservative filter: it prefers keeping a borderline suggestion over hiding a real gap.

const STOP = new Set([
  "a", "an", "and", "or", "the", "of", "for", "to", "in", "on", "at", "by", "with", "if", "is", "are", "be", "any", "all", "per", "present", "needed", "need", "needs", "required", "requirements", "requirement",
  "check", "checks", "checking", "review", "survey", "assess", "assessment", "audit", "verify", "verification", "confirm", "inspect", "inspection", "analysis", "analyses", "analyse", "analyze", "analysing", "details", "detail", "information", "info", "status", "general", "additional", "other",
]);

const SYNONYMS: Record<string, string> = {
  cabling: "cable", cables: "cable", wiring: "cable", wire: "cable", wires: "cable", cord: "cable", cords: "cable",
  routes: "route", routing: "route", routed: "route", containment: "route", conduit: "route", trunking: "route", pathways: "route", pathway: "route",
  measurement: "measure", measurements: "measure", measure: "measure", measured: "measure", distance: "measure", distances: "measure", length: "measure", lengths: "measure", dimension: "measure", dimensions: "measure",
  mounting: "mount", mounts: "mount", mounted: "mount", bracket: "mount", brackets: "mount",
  earthing: "earth", grounding: "earth", ground: "earth", bonding: "earth",
  nvr: "recorder", dvr: "recorder", recorders: "recorder", recording: "recorder", recordings: "recorder",
  cameras: "camera", cams: "camera", cam: "camera",
  panels: "panel", modules: "panel", module: "panel", pv: "panel", array: "panel", arrays: "panel",
  batteries: "battery",
  shade: "shad", shading: "shad", shadow: "shad", shadows: "shad", shaded: "shad", overshadowing: "shad",
  roofs: "roof", rooftop: "roof",
  structural: "structure", structures: "structure",
  inverters: "inverter",
  lights: "lighting", light: "lighting", illumination: "lighting",
  power: "power", supply: "power", electricity: "power",
  legal: "legal", legislation: "legal", regulations: "legal", regulation: "legal", privacy: "privacy",
  permit: "permit", permits: "permit", permission: "permit", permissions: "permit", approvals: "permit", approval: "permit",
  safety: "safety", safe: "safety", hazard: "safety", hazards: "safety",
};

function stem(w: string): string {
  if (SYNONYMS[w]) return SYNONYMS[w];
  let s = w;
  if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.length > 4 && s.endsWith("es") && /(ss|sh|ch|x)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  return SYNONYMS[s] ?? s;
}

/** The meaningful word stems in a piece of text. */
export function meaningWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2 || STOP.has(raw) || /^\d+$/.test(raw)) continue;
    const s = stem(raw);
    if (s.length >= 2 && !STOP.has(s)) out.add(s);
  }
  return out;
}

export type ExistingItem = { title: string; /** What the item says it covers (its "look for" text). */ covers?: string };

function contained(small: Set<string>, big: Set<string>): boolean {
  if (small.size === 0) return false;
  for (const w of small) if (!big.has(w)) return false;
  return true;
}

/** The existing item a suggested title repeats, or undefined if it adds something. */
export function findOverlap(title: string, existing: ExistingItem[]): ExistingItem | undefined {
  const words = meaningWords(title);
  if (words.size === 0) return undefined;
  const norm = title.trim().toLowerCase();
  for (const e of existing) {
    if (e.title.trim().toLowerCase() === norm) return e;
    // Every word of the suggestion is already used by this item's title.
    if (contained(words, meaningWords(e.title))) return e;
    // Or the other way round: the suggestion is the existing item with a little added ("Cable routes" vs "Cable routes and distances").
    const et = meaningWords(e.title);
    if (et.size > 0 && words.size > 1 && contained(et, words) && words.size - et.size <= 1) return e;
  }
  // A longer suggestion whose every word is covered by one item's guidance text.
  if (words.size >= 3) {
    for (const e of existing) if (e.covers && contained(words, new Set([...meaningWords(e.title), ...meaningWords(e.covers)]))) return e;
  }
  return undefined;
}

export type OverlapResult<T extends { title: string }> = { kept: T[]; skipped: Array<{ title: string; duplicateOf: string }> };

/** Splits suggestions into those that add something and those that repeat an existing item or an earlier suggestion in the same list. */
export function dropOverlaps<T extends { title: string }>(suggestions: T[], existing: ExistingItem[]): OverlapResult<T> {
  const kept: T[] = [];
  const skipped: Array<{ title: string; duplicateOf: string }> = [];
  const pool: ExistingItem[] = [...existing];
  for (const s of suggestions) {
    const hit = findOverlap(s.title, pool);
    if (hit) {
      skipped.push({ title: s.title, duplicateOf: hit.title });
      continue;
    }
    kept.push(s);
    pool.push({ title: s.title });
  }
  return { kept, skipped };
}
