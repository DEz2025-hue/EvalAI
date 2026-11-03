/**
 * JSON text with every object's keys in sorted order, so two values with the same content give the same text.
 * Postgres stores JSON with its own key order (jsonb), so a value read back from the database is the same content in a
 * different order; comparing plain JSON.stringify output would call it "changed". Arrays keep their order.
 */
export function canonicalJson(value: unknown): string {
  const sorted = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sorted(o[k])]));
    }
    return v;
  };
  return JSON.stringify(sorted(value));
}
