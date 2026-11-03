// Narration during a live session (decision D-017): audio is recorded in short pieces, each transcribed into an
// editable, UNCONFIRMED transcript. These helpers are pure so they can be tested without a phone.

export type NarrationSegment = {
  id: string;
  /** Epoch milliseconds of the first and last moment the piece covers. */
  startedAt: number;
  endedAt: number;
};

export type TimedFrame = { id: string; takenAt: number };

/**
 * Link each picture to the narration piece it was taken in. A picture taken in a gap between pieces (the recorder
 * restarts at each boundary) goes to the nearest piece. With no pieces, nothing is linked.
 * Returns segment id -> picture ids, oldest picture first.
 */
export function linkFramesToSegments(segments: NarrationSegment[], frames: TimedFrame[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const seg of segments) out[seg.id] = [];
  if (segments.length === 0) return out;
  const sorted = [...frames].sort((a, b) => a.takenAt - b.takenAt);
  for (const f of sorted) {
    let best = segments[0];
    let bestDist = Infinity;
    for (const seg of segments) {
      const dist = f.takenAt < seg.startedAt ? seg.startedAt - f.takenAt : f.takenAt > seg.endedAt ? f.takenAt - seg.endedAt : 0;
      if (dist < bestDist) {
        best = seg;
        bestDist = dist;
      }
    }
    out[best.id].push(f.id);
  }
  return out;
}

export type TextPart = { text: string; check: boolean };

// A number (with an optional decimal part) or a spelled-out number, followed by a unit.
const UNIT = "(?:mm|cm|km|m2|m²|m|ft|feet|foot|inches|inch|in|metres|meters|metre|meter|kwh|kwp|kv|kw|mw|ma|volts?|v|amps?|a|watts?|w|hz|ohms?|mohm|kohm|degrees?|°c|°f|°|%|percent|mbps|gbps|mb|gb|tb|tiles?|panels?|cameras?|strings?)";
const WORDS = "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)";
const CLAIM = new RegExp(`\\b(?:\\d+(?:[.,]\\d+)?|${WORDS}(?:[ -]${WORDS})*)\\s*${UNIT}(?![a-z0-9])`, "gi");

/**
 * Split a transcript into plain and "check this" parts. Numbers and units are what speech recognition mishears most
 * (and what matters most), so they are highlighted for the person to confirm. Nothing here changes the text.
 */
export function findNumberClaims(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(CLAIM)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: text.slice(last, i), check: false });
    parts.push({ text: m[0], check: true });
    last = i + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), check: false });
  return parts.length > 0 ? parts : [{ text, check: false }];
}

/** The line stored on a checklist item when a person attaches a confirmed narration piece. Never changes the item's status. */
export function narrationNoteLine(text: string, when: Date): string {
  return `[Live narration ${when.toLocaleString()}] ${text.trim()}`;
}
