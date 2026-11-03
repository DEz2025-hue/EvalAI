import { DECISION_BASES, toNum, type DecisionBasis, type DesignDecision, type DesignEquipment, type DesignOpenItem, type DesignOption } from "./design";

// Solar design and sizing proposal (decision D-036). For a new solar installation the report is a design: the loads, the assumptions the
// sizing rests on, and the array, inverter and battery that follow. The AI drafts the load list and the assumptions from the record (the
// load audit, label readings from photos, the interview); the arithmetic is done here, in code, and printed with its formulas, so every
// size in the report can be traced back to a load and an assumption. A person edits and signs it off.

export const SYSTEM_TYPES = ["grid_tied", "hybrid", "off_grid"] as const;
export type SystemType = (typeof SYSTEM_TYPES)[number];
export const SYSTEM_TYPE_LABEL: Record<SystemType, string> = {
  grid_tied: "Grid-tied (no battery)",
  hybrid: "Hybrid (grid or generator plus battery)",
  off_grid: "Off-grid (battery only)",
};

/** Where a load figure came from: printed on the appliance label, said by the client, a typical value for that kind of appliance, or an assumption. */
export const LOAD_SOURCES = ["label", "client", "typical", "assumption"] as const;
export type LoadSource = (typeof LOAD_SOURCES)[number];
export const LOAD_SOURCE_LABEL: Record<LoadSource, string> = { label: "Label reading", client: "Client", typical: "Typical value", assumption: "Assumption" };

/** One line of the load schedule. `motor` marks loads with a start-up surge (air conditioners, fridges, pumps, motors). */
export type SolarLoad = { name: string; quantity: number; watts: number; hoursPerDay: number; source: LoadSource; motor: boolean; note: string };

/** A sizing input with where it came from. */
export type SizingValue = { value: number; basis: DecisionBasis; note: string };

export type SolarInputs = {
  systemType: SystemType;
  /** Average peak sun hours per day at the site (kWh/m²/day). */
  peakSunHours: SizingValue;
  /** Share of energy lost to heat, dust, wiring and conversion (0 to 0.6). */
  systemLosses: SizingValue;
  /** Rated power of one panel, W. */
  panelWatts: SizingValue;
  /** Battery bank voltage, V. */
  batteryVoltage: SizingValue;
  /** Usable share of the battery (0.3 to 1). */
  depthOfDischarge: SizingValue;
  /** Days the battery should carry the daily load alone (0 to 5; hybrid systems usually less than 1). */
  autonomyDays: SizingValue;
  /** Share of the connected load expected to run at the same time (0.2 to 1). */
  simultaneity: SizingValue;
};

export type SolarDesign = {
  /** Decisions the design rests on (system type, backup needs, budget, roof choice...). */
  basis: DesignDecision[];
  loads: SolarLoad[];
  inputs: SolarInputs;
  /** Where the panels go and why, from the roof survey and photos. */
  placement: string[];
  options: DesignOption[];
  /** Everything except the panels, inverter and battery, which are listed from the sizing. */
  equipment: DesignEquipment[];
  installation: string[];
  openItems: DesignOpenItem[];
  nextSteps: string[];
};

export const SOLAR_LIMITS = { loads: 60, basis: 30, placement: 10, options: 15, equipment: 40, installation: 15, openItems: 30, nextSteps: 15, short: 160, text: 600 } as const;

/** Allowed range and default of each numeric input. Defaults are common planning values and are always marked as assumptions. */
export const SIZING_RANGES: Record<Exclude<keyof SolarInputs, "systemType">, { min: number; max: number; default: number; unit: string; label: string }> = {
  peakSunHours: { min: 1, max: 8, default: 5, unit: "h/day", label: "Peak sun hours" },
  systemLosses: { min: 0, max: 0.6, default: 0.25, unit: "", label: "System losses" },
  panelWatts: { min: 50, max: 800, default: 550, unit: "W", label: "Panel rating" },
  batteryVoltage: { min: 12, max: 800, default: 48, unit: "V", label: "Battery voltage" },
  depthOfDischarge: { min: 0.3, max: 1, default: 0.8, unit: "", label: "Usable depth of discharge" },
  autonomyDays: { min: 0, max: 5, default: 1, unit: "days", label: "Battery autonomy" },
  simultaneity: { min: 0.2, max: 1, default: 0.7, unit: "", label: "Simultaneity" },
};

/** Battery and inverter conversion efficiency used for the battery size. */
export const BATTERY_ROUND_TRIP = 0.9;
/** Headroom on the inverter's continuous rating above the expected peak. */
export const INVERTER_MARGIN = 1.25;
/** Extra start-up power of a motor load, as a multiple of its running power. */
export const MOTOR_SURGE_FACTOR = 2;

const L = SOLAR_LIMITS;
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const lines = (v: unknown, n: number): string[] => (Array.isArray(v) ? v.map((x) => text(x, L.text)).filter(Boolean).slice(0, n) : []);
const num = toNum;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const basisOf = (v: unknown): DecisionBasis => ((DECISION_BASES as readonly string[]).includes(String(v)) ? (v as DecisionBasis) : "assumption");
const rows = <T>(v: unknown, n: number, one: (r: Record<string, unknown>) => T | null): T[] =>
  (Array.isArray(v) ? v : [])
    .map((r) => (r && typeof r === "object" ? one(r as Record<string, unknown>) : null))
    .filter((r): r is T => r !== null)
    .slice(0, n);

function cleanValue(raw: unknown, key: keyof typeof SIZING_RANGES): SizingValue {
  const r = SIZING_RANGES[key];
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : { value: raw };
  const n = num(o.value);
  if (!Number.isFinite(n)) return { value: r.default, basis: "assumption", note: "Planning default" };
  return { value: Math.round(clamp(n, r.min, r.max) * 1000) / 1000, basis: basisOf(o.basis), note: text(o.note, L.short) };
}

/**
 * Checks and tidies a solar design from the AI or an editor (untrusted): text trimmed and capped, loads with no name or no power dropped,
 * numbers kept inside sensible ranges, missing inputs filled with planning defaults marked as assumptions. Returns null when there is no
 * load to size from.
 */
export function cleanSolarDesign(raw: unknown): SolarDesign | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const loads = rows(d.loads, L.loads, (l) => {
    const name = text(l.name, L.short);
    const watts = num(l.watts);
    if (!name || !Number.isFinite(watts) || watts <= 0) return null;
    const quantity = Math.round(num(l.quantity));
    const hours = num(l.hoursPerDay);
    return {
      name,
      quantity: Number.isFinite(quantity) ? clamp(quantity, 1, 500) : 1,
      watts: Math.round(clamp(watts, 1, 100_000)),
      hoursPerDay: Number.isFinite(hours) ? Math.round(clamp(hours, 0, 24) * 100) / 100 : 0,
      source: (LOAD_SOURCES as readonly string[]).includes(String(l.source)) ? (l.source as LoadSource) : "assumption",
      motor: l.motor === true,
      note: text(l.note, L.short),
    };
  });
  if (loads.length === 0) return null;
  const i = (d.inputs && typeof d.inputs === "object" ? d.inputs : {}) as Record<string, unknown>;
  const inputs: SolarInputs = {
    systemType: (SYSTEM_TYPES as readonly string[]).includes(String(i.systemType)) ? (i.systemType as SystemType) : "hybrid",
    peakSunHours: cleanValue(i.peakSunHours, "peakSunHours"),
    systemLosses: cleanValue(i.systemLosses, "systemLosses"),
    panelWatts: cleanValue(i.panelWatts, "panelWatts"),
    batteryVoltage: cleanValue(i.batteryVoltage, "batteryVoltage"),
    depthOfDischarge: cleanValue(i.depthOfDischarge, "depthOfDischarge"),
    autonomyDays: cleanValue(i.autonomyDays, "autonomyDays"),
    simultaneity: cleanValue(i.simultaneity, "simultaneity"),
  };
  return {
    basis: rows(d.basis, L.basis, (b) => {
      const item = text(b.item, L.short);
      const decision = text(b.decision, L.text);
      return item && decision ? { item, decision, basis: basisOf(b.basis) } : null;
    }),
    loads,
    inputs,
    placement: lines(d.placement, L.placement),
    options: rows(d.options, L.options, (o) => {
      const gap = text(o.gap, L.text);
      return gap ? { area: text(o.area, L.short), gap, option: text(o.option, L.short), extraCameras: 0 } : null;
    }),
    equipment: rows(d.equipment, L.equipment, (e) => {
      const item = text(e.item, L.short);
      return item ? { item, quantity: text(e.quantity, 40), specification: text(e.specification, L.text) } : null;
    }),
    installation: lines(d.installation, L.installation),
    openItems: rows(d.openItems, L.openItems, (o) => {
      const item = text(o.item, L.text);
      return item ? { item, status: text(o.status, 60) || "To be confirmed" } : null;
    }),
    nextSteps: lines(d.nextSteps, L.nextSteps),
  };
}

export function hasSolarDesign(d: SolarDesign | null | undefined): d is SolarDesign {
  return !!d && Array.isArray(d.loads) && d.loads.length > 0;
}

/** One step of the sizing, as printed in the report: what it is, how it was worked out, and the result. */
export type SizingStep = { label: string; formula: string; value: number; unit: string };

export type SolarSizing = {
  dailyWh: number;
  connectedW: number;
  peakW: number;
  surgeW: number;
  inverterW: number;
  arrayWpNeeded: number;
  panelCount: number;
  arrayWp: number;
  dailyProductionWh: number;
  /** Zero for a grid-tied system. */
  batteryUsableWh: number;
  batteryNominalWh: number;
  batteryAh: number;
  steps: SizingStep[];
  /** Each load's share of the daily energy, largest first. */
  loadShares: Array<{ name: string; wh: number; share: number }>;
};

const roundUp = (v: number, step: number) => Math.ceil(v / step) * step;
const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d });

/**
 * The sizing, worked out from the load schedule and the inputs. Deterministic and printed with its formulas: this is the only place a size
 * in the solar proposal comes from.
 */
export function solarSizing(d: SolarDesign): SolarSizing {
  const v = (k: keyof typeof SIZING_RANGES) => d.inputs[k].value;
  const dailyWh = d.loads.reduce((s, l) => s + l.quantity * l.watts * l.hoursPerDay, 0);
  const connectedW = d.loads.reduce((s, l) => s + l.quantity * l.watts, 0);
  const peakW = connectedW * v("simultaneity");
  // The largest motor starting while the expected peak is running.
  const biggestMotor = Math.max(0, ...d.loads.filter((l) => l.motor).map((l) => l.watts));
  const surgeW = peakW + biggestMotor * MOTOR_SURGE_FACTOR;
  const inverterW = Math.max(1000, roundUp(peakW * INVERTER_MARGIN, 500));
  const yieldFactor = v("peakSunHours") * (1 - v("systemLosses"));
  const arrayWpNeeded = yieldFactor > 0 ? dailyWh / yieldFactor : 0;
  const panelCount = Math.max(1, Math.ceil(arrayWpNeeded / v("panelWatts")));
  const arrayWp = panelCount * v("panelWatts");
  const dailyProductionWh = arrayWp * yieldFactor;
  const withBattery = d.inputs.systemType !== "grid_tied";
  const batteryUsableWh = withBattery ? dailyWh * v("autonomyDays") : 0;
  const batteryNominalWh = withBattery ? batteryUsableWh / (v("depthOfDischarge") * BATTERY_ROUND_TRIP) : 0;
  const batteryAh = withBattery ? batteryNominalWh / v("batteryVoltage") : 0;

  const steps: SizingStep[] = [
    { label: "Daily energy need", formula: "Sum of quantity x power x hours per day, over every load", value: Math.round(dailyWh), unit: "Wh/day" },
    { label: "Connected load", formula: "Sum of quantity x power, over every load", value: Math.round(connectedW), unit: "W" },
    { label: "Expected peak load", formula: `Connected load x simultaneity ${v("simultaneity")}`, value: Math.round(peakW), unit: "W" },
    { label: "Inverter continuous rating", formula: `Peak load x ${INVERTER_MARGIN} headroom, rounded up to 500 W (at least 1,000 W)`, value: inverterW, unit: "W" },
    { label: "Inverter surge needed", formula: biggestMotor ? `Peak load + largest motor load (${fmt(biggestMotor)} W) x ${MOTOR_SURGE_FACTOR} for start-up` : "Peak load (no motor loads listed)", value: Math.round(surgeW), unit: "W" },
    { label: "Array size needed", formula: `Daily energy / (peak sun hours ${v("peakSunHours")} x (1 - losses ${v("systemLosses")}))`, value: Math.round(arrayWpNeeded), unit: "Wp" },
    { label: "Panels", formula: `Array size / ${fmt(v("panelWatts"))} W per panel, rounded up`, value: panelCount, unit: "panels" },
    { label: "Array as built", formula: `${panelCount} panels x ${fmt(v("panelWatts"))} W`, value: arrayWp, unit: "Wp" },
    { label: "Expected daily production", formula: "Array x peak sun hours x (1 - losses)", value: Math.round(dailyProductionWh), unit: "Wh/day" },
  ];
  if (withBattery) {
    steps.push(
      { label: "Battery energy to deliver", formula: `Daily energy x ${v("autonomyDays")} day(s) of autonomy`, value: Math.round(batteryUsableWh), unit: "Wh" },
      { label: "Battery bank size", formula: `Energy to deliver / (depth of discharge ${v("depthOfDischarge")} x efficiency ${BATTERY_ROUND_TRIP})`, value: Math.round(batteryNominalWh), unit: "Wh" },
      { label: "Battery capacity", formula: `Bank size / ${fmt(v("batteryVoltage"))} V`, value: Math.round(batteryAh), unit: "Ah" },
    );
  }
  const loadShares = d.loads
    .map((l) => ({ name: l.quantity > 1 ? `${l.name} (x${l.quantity})` : l.name, wh: l.quantity * l.watts * l.hoursPerDay }))
    .sort((a, b) => b.wh - a.wh)
    .map((l) => ({ ...l, share: dailyWh > 0 ? l.wh / dailyWh : 0 }));
  return { dailyWh, connectedW, peakW, surgeW, inverterW, arrayWpNeeded, panelCount, arrayWp, dailyProductionWh, batteryUsableWh, batteryNominalWh, batteryAh, steps, loadShares };
}

/** "3.85 kWp", "12.4 kWh", "5 kW": a power or energy in the unit a client reads most easily. */
export function kilo(valueW: number, unit: "W" | "Wp" | "Wh"): string {
  return valueW >= 1000 ? `${fmt(valueW / 1000, 2)} k${unit}` : `${fmt(valueW)} ${unit}`;
}

/** The main equipment that follows from the sizing, listed ahead of the AI's other equipment. */
export function sizedEquipment(d: SolarDesign, s: SolarSizing = solarSizing(d)): DesignEquipment[] {
  const out: DesignEquipment[] = [
    { item: "Solar panels", quantity: String(s.panelCount), specification: `${fmt(d.inputs.panelWatts.value)} W each, ${kilo(s.arrayWp, "Wp")} in total` },
    { item: d.inputs.systemType === "grid_tied" ? "Grid-tied inverter" : "Hybrid / off-grid inverter", quantity: "1", specification: `At least ${kilo(s.inverterW, "W")} continuous, ${kilo(s.surgeW, "W")} surge` },
  ];
  if (s.batteryNominalWh > 0) out.push({ item: "Battery bank", quantity: "1", specification: `About ${kilo(s.batteryNominalWh, "Wh")} at ${fmt(d.inputs.batteryVoltage.value)} V (${fmt(s.batteryAh)} Ah), ${Math.round(d.inputs.depthOfDischarge.value * 100)}% usable` });
  return out;
}

/** Jobs that get a solar design proposal: a solar job where nothing is installed yet. */
export function isSolarDesignJob(pack: string, scenario: string | null | undefined): boolean {
  return pack === "solar" && scenario === "new_install";
}
