import { describe, it, expect } from "vitest";
import { cleanSolarDesign, isSolarDesignJob, kilo, sizedEquipment, solarSizing, SIZING_RANGES, type SolarDesign } from "../solarDesign";
import { reportLayout } from "../reportOverview";
import { buildReportHtml } from "../reportHtml";
import { previewKey } from "../reportGate";
import type { ReportInput, ReportSnapshot } from "../report";

// Solar design and sizing proposals (D-036): the AI drafts loads and assumptions, the code does every calculation.

const v = (value: number, basis: "client" | "site" | "assumption" = "assumption") => ({ value, basis, note: "" });
const design = (over: Partial<SolarDesign> = {}): SolarDesign => ({
  basis: [{ item: "System type", decision: "Hybrid for backup during outages", basis: "client" }],
  loads: [
    { name: "Split air conditioner", quantity: 2, watts: 1000, hoursPerDay: 6, source: "label", motor: true, note: "" },
    { name: "Refrigerator", quantity: 1, watts: 150, hoursPerDay: 24, source: "typical", motor: true, note: "" },
    { name: "LED lights", quantity: 10, watts: 10, hoursPerDay: 5, source: "client", motor: false, note: "" },
  ],
  inputs: {
    systemType: "hybrid",
    peakSunHours: v(5),
    systemLosses: v(0.25),
    panelWatts: v(550),
    batteryVoltage: v(48),
    depthOfDischarge: v(0.8),
    autonomyDays: v(1),
    simultaneity: v(0.7),
  },
  placement: ["The larger right-hand slope is clearest."],
  options: [],
  equipment: [{ item: "Mounting rails", quantity: "to be sized after the survey", specification: "For corrugated sheet" }],
  installation: ["Survey"],
  openItems: [{ item: "Peak sun hours for the location", status: "To be confirmed" }],
  nextSteps: ["Confirm the loads"],
  ...over,
});

describe("solarSizing", () => {
  const s = solarSizing(design());

  it("adds up daily energy and connected load from the schedule", () => {
    // 2 x 1000 x 6 + 150 x 24 + 10 x 10 x 5 = 12000 + 3600 + 500
    expect(s.dailyWh).toBe(16100);
    expect(s.connectedW).toBe(2000 + 150 + 100);
    expect(s.peakW).toBeCloseTo(2250 * 0.7);
  });

  it("sizes the inverter with headroom and the surge for the biggest motor", () => {
    // 1575 x 1.25 = 1968.75 -> 2000
    expect(s.inverterW).toBe(2000);
    expect(s.surgeW).toBeCloseTo(1575 + 1000 * 2);
  });

  it("sizes the array from sun hours and losses, in whole panels", () => {
    // 16100 / (5 x 0.75) = 4293.3 Wp -> 8 panels of 550 W = 4400 Wp
    expect(Math.round(s.arrayWpNeeded)).toBe(4293);
    expect(s.panelCount).toBe(8);
    expect(s.arrayWp).toBe(4400);
    expect(s.dailyProductionWh).toBeCloseTo(4400 * 5 * 0.75);
  });

  it("sizes the battery from autonomy, depth of discharge and efficiency", () => {
    // 16100 x 1 / (0.8 x 0.9) = 22361 Wh, / 48 V = 466 Ah
    expect(Math.round(s.batteryNominalWh)).toBe(22361);
    expect(Math.round(s.batteryAh)).toBe(466);
  });

  it("a grid-tied system has no battery and no battery steps", () => {
    const g = solarSizing(design({ inputs: { ...design().inputs, systemType: "grid_tied" } }));
    expect(g.batteryNominalWh).toBe(0);
    expect(g.steps.some((st) => st.label.startsWith("Battery"))).toBe(false);
  });

  it("prints every step with its formula, and ranks what drives the size", () => {
    expect(s.steps.map((st) => st.label)).toContain("Array size needed");
    expect(s.steps.find((st) => st.label === "Panels")!.formula).toMatch(/550 W per panel, rounded up/);
    expect(s.loadShares[0]).toMatchObject({ name: "Split air conditioner (x2)" });
    expect(s.loadShares[0].share).toBeCloseTo(12000 / 16100);
  });

  it("lists the panels, inverter and battery from the sizing", () => {
    const eq = sizedEquipment(design(), s);
    expect(eq.map((e) => [e.item, e.quantity])).toEqual([["Solar panels", "8"], ["Hybrid / off-grid inverter", "1"], ["Battery bank", "1"]]);
    expect(eq[0].specification).toContain("4.4 kWp");
    expect(kilo(950, "W")).toBe("950 W");
  });
});

describe("cleanSolarDesign", () => {
  it("keeps a valid design as it is", () => {
    expect(cleanSolarDesign(design())).toEqual(design());
  });

  it("needs at least one load with a name and a power", () => {
    expect(cleanSolarDesign(null)).toBeNull();
    expect(cleanSolarDesign({ loads: [{ name: "Mystery", watts: 0 }, { name: "", watts: 100 }] })).toBeNull();
  });

  it("keeps numbers in range, reads numbers written as text, and fills missing inputs with defaults marked as assumptions", () => {
    const d = cleanSolarDesign({
      loads: [{ name: "Pump", quantity: "2", watts: "750 W", hoursPerDay: 30, source: "nonsense", motor: true }],
      inputs: { systemType: "weird", peakSunHours: { value: 40, basis: "client" }, depthOfDischarge: 0.5 },
    })!;
    expect(d.loads[0]).toMatchObject({ quantity: 2, watts: 750, hoursPerDay: 24, source: "assumption", motor: true });
    expect(d.inputs.systemType).toBe("hybrid");
    expect(d.inputs.peakSunHours).toEqual({ value: SIZING_RANGES.peakSunHours.max, basis: "client", note: "" });
    expect(d.inputs.depthOfDischarge.value).toBe(0.5);
    expect(d.inputs.panelWatts).toEqual({ value: 550, basis: "assumption", note: "Planning default" });
  });
});

describe("the solar design in the report", () => {
  const snap: ReportSnapshot = { id: "snap_s", assessmentId: "a1", assessmentVersion: 1, checklistVersion: "v1", createdAt: "2026-11-03T00:00:00.000Z", createdBy: "u", finalized: false, immutable: true };
  const input = (solar?: SolarDesign): ReportInput => ({ siteName: "Palm Road house", mode: "assessment", pack: "solar", context: { scenario: "new_install" }, checklist: [], findings: [], measurements: [], limitations: [], narrative: { summary: "A hybrid system.", ...(solar ? { solar } : {}) } });

  it("is only for a new solar installation, and uses the solar layout when the draft has loads", () => {
    expect(isSolarDesignJob("solar", "new_install")).toBe(true);
    expect(isSolarDesignJob("solar", "existing")).toBe(false);
    expect(isSolarDesignJob("cctv", "new_install")).toBe(false);
    expect(reportLayout(input(design()))).toBe("solar");
    expect(reportLayout(input())).toBe("findings");
  });

  it("prints the headline figures, the load schedule with sources, every sizing step with its formula and the equipment", () => {
    const html = buildReportHtml(snap, input(design()));
    expect(html).toContain("Solar design and sizing proposal");
    expect(html).toContain("4.4 kWp");
    expect(html).toContain("8 x 550 W");
    expect(html).toContain("Load schedule");
    expect(html).toContain("Label reading");
    // The total daily energy in the load schedule's total row.
    expect(html).toContain("<strong>16100</strong>");
    expect(html).toContain("Daily energy / (peak sun hours 5 x (1 - losses 0.25))");
    expect(html).toContain("Expected daily production");
    expect(html).toContain("Battery bank");
    expect(html).toContain("Panel placement");
    expect(html).not.toContain("Key findings");
  });

  it("escapes everything the AI or an editor wrote", () => {
    const html = buildReportHtml(snap, input(design({ loads: [{ ...design().loads[0], name: "<img src=x onerror=alert(1)>" }] })));
    expect(html).not.toContain("<img src=x");
  });

  it("an edited load means the draft must be previewed again", () => {
    const a = previewKey({ id: "s1", finalized: false, payload: { narrative: { solar: design() } } });
    const b = previewKey({ id: "s1", finalized: false, payload: { narrative: { solar: design({ loads: design().loads.slice(1) }) } } });
    expect(a).not.toBe(b);
  });
});
