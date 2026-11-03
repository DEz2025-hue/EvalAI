// A last check on AI-written report text (D-010: no invented measurements, quantities, prices or ages).
//
// The model is told to use numbers only as supplied. This finds any figure WITH A UNIT (or a % or a currency amount) in its text
// that does not appear anywhere in the facts it was given, so the person reviewing the draft can look at it first. Bare numbers
// ("3 items", "twelve") are not checked. It is a warning, not proof: it cannot tell a wrong claim from a right one.

// Units that are unambiguous even after a space ("12 kW", "30 days").
const SPACED_UNITS = "kwp|kwh|kw|mw|wh|hz|khz|mhz|ghz|m²|m2|m³|m3|mm|cm|km|m|ft|lux|mp|tb|gb|mb|mbps|kg|volts?|amps?|watts?|years?|yrs?|months?|weeks?|days?|hours?|hrs?|°c|°f";
// Single letters that only count when written straight after the number ("12V", "10A", "5W").
const ATTACHED_UNITS = "w|v|a|ah|g";

const NUMBER = "\\d[\\d,]*(?:\\.\\d+)?";
const WITH_UNIT = new RegExp(`(?<![\\w.])(${NUMBER})(?:\\s?(${SPACED_UNITS})|(${ATTACHED_UNITS}))(?![\\p{L}\\d])`, "giu");
const PERCENT = new RegExp(`(?<![\\w.])(${NUMBER})\\s?%`, "g");
const CURRENCY_BEFORE = new RegExp(`[$€£]\\s?(${NUMBER})`, "g");
const CURRENCY_AFTER = new RegExp(`(?<![\\w.])(${NUMBER})\\s?(?:usd|aud|eur|gbp|ngn|zar|kes|ghs)\\b`, "gi");

const toNumber = (s: string) => Number(s.replace(/,/g, ""));

/** Every number that appears anywhere in the facts (so a figure copied from a note, a measurement or a count is fine). */
export function numbersIn(facts: unknown): Set<number> {
  const text = typeof facts === "string" ? facts : JSON.stringify(facts ?? "");
  const out = new Set<number>();
  for (const m of text.matchAll(new RegExp(NUMBER, "g"))) {
    const n = toNumber(m[0]);
    if (Number.isFinite(n)) out.add(n);
  }
  return out;
}

/** Figures with a unit, %, or currency in `text` that are not in `facts`. At most 10, in the order they appear, without repeats. */
export function findUnverifiedFigures(text: string, facts: unknown): string[] {
  const known = numbersIn(facts);
  const found: string[] = [];
  const check = (re: RegExp) => {
    for (const m of text.matchAll(re)) {
      const n = toNumber(m[1]);
      const shown = m[0].trim();
      if (Number.isFinite(n) && !known.has(n) && !found.includes(shown)) found.push(shown);
    }
  };
  for (const re of [WITH_UNIT, PERCENT, CURRENCY_BEFORE, CURRENCY_AFTER]) check(re);
  return found.sort((a, b) => text.indexOf(a) - text.indexOf(b)).slice(0, 10);
}
