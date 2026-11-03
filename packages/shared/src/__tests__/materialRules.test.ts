import { describe, it, expect } from "vitest";
import { MATERIAL_RULES, QUANTITY_TBD, RULE_IDS, applyRule, displayQuantity, isRuleId, ruleCatalog, type RuleInputValue } from "../materialRules";

const rec = (value: number): RuleInputValue => ({ value, from: "record" });
const ok = (id: string, given: Record<string, RuleInputValue>) => {
  const r = applyRule(id, given);
  if (!r.ok) throw new Error(`${id}: ${r.reason}`);
  return r;
};

describe("material rules: the arithmetic", () => {
  it("pv_modules_by_target rounds up: 5 kW at 450 W is 12 modules", () => {
    const r = ok("pv_modules_by_target", { targetKw: rec(5) });
    expect(r.quantity).toBe(12); // 5000 / 450 = 11.1 -> 12
    expect(r.unit).toBe("pcs");
    expect(r.assumed).toEqual(["Module rating (typical class)"]); // the 450 W was not recorded
    expect(ok("pv_modules_by_target", { targetKw: rec(5), moduleW: rec(500) }).quantity).toBe(10);
  });

  it("pv_modules_by_area rounds down and keeps a spacing allowance", () => {
    expect(ok("pv_modules_by_area", { usableAreaM2: rec(42.5) }).quantity).toBe(17); // 42.5 / (2.2 * 1.1) = 17.56 -> 17
    expect(ok("pv_modules_by_area", { usableAreaM2: rec(42.5), moduleAreaM2: rec(2) }).quantity).toBe(19); // 42.5 / 2.2 = 19.3
  });

  it("cable_run adds the sag and terminations allowances for every conductor", () => {
    const r = ok("cable_run", { runLengthM: rec(18) });
    expect(r.quantity).toBe(41.8); // (18 * 1.05 + 2) * 2 = 41.8
    expect(r.unit).toBe("m");
    expect(ok("cable_run", { runLengthM: rec(18), conductors: rec(1), allowanceM: rec(0) }).quantity).toBe(18.9);
  });

  it("mounting_clamps is modules times the allowance", () => {
    expect(ok("mounting_clamps", { modules: rec(12) }).quantity).toBe(48);
    expect(ok("mounting_clamps", { modules: rec(12), clampsPerModule: rec(6) }).quantity).toBe(72);
  });

  it("cctv_storage_tb: 8 cameras at 4 Mbps for 30 days with headroom", () => {
    const r = ok("cctv_storage_tb", { cameras: rec(8) });
    // 8 * 4 * 86400 * 30 / 8 / 1e6 = 10.368 TB; * 1.2 = 12.44 -> 12.5 (rounded up to 0.1)
    expect(r.quantity).toBe(12.5);
    expect(r.unit).toBe("TB");
    expect(r.assumed).toEqual(["Average bitrate per camera (typical)", "Days of recordings wanted"]);
    expect(ok("cctv_storage_tb", { cameras: rec(8), bitrateMbps: rec(4), retentionDays: rec(30) }).assumed).toEqual([]);
  });

  it("cctv_recorder_channels picks the next standard size, and refuses more than the largest", () => {
    expect([1, 4, 5, 8, 9, 16, 17, 33].map((c) => ok("cctv_recorder_channels", { cameras: rec(c) }).quantity)).toEqual([4, 4, 8, 8, 16, 16, 32, 64]);
    expect(applyRule("cctv_recorder_channels", { cameras: rec(65) })).toMatchObject({ ok: false });
  });

  it("poe_ports keeps spare ports and rounds to a standard switch", () => {
    expect(ok("poe_ports", { cameras: rec(4) }).quantity).toBe(8); // 4 + 2 = 6 -> 8
    expect(ok("poe_ports", { cameras: rec(8) }).quantity).toBe(16); // 8 + 2 = 10 -> 16
    expect(ok("poe_ports", { cameras: rec(20) }).quantity).toBe(24); // 20 + 4 = 24 -> 24
    expect(ok("poe_ports", { cameras: rec(45) }).quantity).toBe(96); // 45 + 9 = 54 -> beyond 48: two 48-port switches
  });
});

describe("material rules: inputs", () => {
  it("a rule that needs a recorded value cannot run without it, and says what is missing", () => {
    const r = applyRule("pv_modules_by_target", {});
    expect(r).toMatchObject({ ok: false, missing: ["Target system size"] });
    expect(applyRule("cable_run", {})).toMatchObject({ ok: false, missing: ["Measured run length"] });
  });

  it("an out-of-range recorded value is not trusted: a typical value replaces an assumption, a missing recorded value stops the rule", () => {
    expect(ok("pv_modules_by_target", { targetKw: rec(5), moduleW: rec(5) }).used.find((u) => u.name === "moduleW")).toMatchObject({ value: 450, assumed: true });
    expect(applyRule("pv_modules_by_target", { targetKw: rec(-3) })).toMatchObject({ ok: false });
    expect(applyRule("pv_modules_by_target", { targetKw: rec(Number.NaN) })).toMatchObject({ ok: false });
    expect(applyRule("cable_run", { runLengthM: rec(1e9) })).toMatchObject({ ok: false });
  });

  it("an input the caller says was assumed marks the result as assumed", () => {
    const r = ok("pv_modules_by_target", { targetKw: { value: 5, from: "assumed" }, moduleW: rec(450) });
    expect(r.assumed).toEqual(["Target system size"]);
  });

  it("an unknown rule is refused", () => {
    expect(applyRule("magic_quantity", {})).toMatchObject({ ok: false, reason: "Unknown rule" });
    expect(isRuleId("cable_run")).toBe(true);
    expect(isRuleId("nope")).toBe(false);
  });

  it("no rule ever returns a zero, negative or non-finite quantity for in-range inputs", () => {
    for (const id of RULE_IDS) {
      const defs = MATERIAL_RULES[id].inputs;
      for (const pick of ["min", "max"] as const) {
        const given = Object.fromEntries(defs.map((d) => [d.name, rec(d[pick])]));
        const r = applyRule(id, given);
        if (r.ok) {
          expect(Number.isFinite(r.quantity), `${id} ${pick}`).toBe(true);
          expect(r.quantity, `${id} ${pick}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("explanations and the catalog", () => {
  it("states the numbers used and the rule version, so the quantity can be traced", () => {
    const r = ok("cable_run", { runLengthM: rec(18) });
    expect(r.explanation).toContain("18 m × 1.05 sag");
    expect(r.explanation).toContain("= 41.8 m");
    expect(r.explanation).toContain("rule cable_run v1");
  });

  it("the catalog is plain data (safe to send to the AI) and covers every rule", () => {
    const cat = ruleCatalog();
    expect(cat.map((c) => c.id)).toEqual(RULE_IDS);
    expect(() => JSON.stringify(cat)).not.toThrow();
    expect(JSON.stringify(cat)).not.toContain("compute");
    for (const c of cat) expect(c.inputs.every((i) => ["measurement", "record", "assumption"].includes(i.kind))).toBe(true);
  });

  it("every typical value sits inside its own range", () => {
    for (const id of RULE_IDS) for (const d of MATERIAL_RULES[id].inputs) if (d.default !== undefined) expect(d.default >= d.min && d.default <= d.max, `${id}.${d.name}`).toBe(true);
  });
});

describe("TBD quantities", () => {
  it("show TBD instead of the placeholder 1", () => {
    expect(displayQuantity({ quantity: 1, unit: "pcs", assumptions: [QUANTITY_TBD + ": not enough recorded"] })).toBe("TBD");
    expect(displayQuantity({ quantity: 12, unit: "pcs", assumptions: ["Module rating assumed"] })).toBe("12 pcs");
    expect(displayQuantity({ quantity: 3, unit: "m" })).toBe("3 m");
  });
});
