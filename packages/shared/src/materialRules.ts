import { cableLengthWithSag } from "./measurements";

// Documented rules for materials quantities (D-029). Every quantity the app can state with confidence comes from one of these,
// computed HERE in code from recorded values, never by AI. They are starting allowances written down and tested, not design
// calculations or standards: a qualified designer sizes and verifies the system. An input that was assumed (not recorded) makes the
// resulting quantity provisional.

export const MATERIAL_RULES_VERSION = 1;

/** Marker kept in an item's assumptions when its quantity is not known. The item is stored with quantity 1 and shown as TBD. */
export const QUANTITY_TBD = "Quantity to be determined";

export type RuleId = "pv_modules_by_target" | "pv_modules_by_area" | "cable_run" | "mounting_clamps" | "cctv_storage_tb" | "cctv_recorder_channels" | "poe_ports";

/**
 * Where an input comes from. `measurement`: a recorded measurement. `record`: a figure in the job record or the person's answers
 * (for example the 5 kW the customer wants). `assumption`: a typical value the rule supplies when nothing was recorded.
 */
export type RuleInputKind = "measurement" | "record" | "assumption";

export type RuleInputDef = { name: string; label: string; unit: string; kind: RuleInputKind; /** Used (and marked assumed) when nothing was recorded. */ default?: number; min: number; max: number };

type RuleDef = {
  label: string;
  unit: string;
  /** The rule in words, with the numbers filled in by `explain`. */
  formula: string;
  inputs: RuleInputDef[];
  compute: (v: Record<string, number>) => number;
  explain: (v: Record<string, number>, q: number) => string;
};

const ceil1 = (n: number) => Math.ceil(n * 10 - 1e-9) / 10;
const nextOf = (sizes: number[], n: number) => sizes.find((s) => s >= n);
const g = (n: number) => String(Math.round(n * 100) / 100);

export const MATERIAL_RULES: Record<RuleId, RuleDef> = {
  pv_modules_by_target: {
    label: "Solar modules to reach a target size",
    unit: "pcs",
    formula: "modules = round up (target kW × 1000 ÷ module watts)",
    inputs: [
      { name: "targetKw", label: "Target system size", unit: "kW", kind: "record", min: 0.1, max: 1000 },
      { name: "moduleW", label: "Module rating (typical class)", unit: "W", kind: "assumption", default: 450, min: 100, max: 800 },
    ],
    compute: (v) => Math.ceil((v.targetKw * 1000) / v.moduleW - 1e-9),
    explain: (v, q) => `${g(v.targetKw)} kW × 1000 ÷ ${g(v.moduleW)} W per module = ${q} modules (rounded up)`,
  },
  pv_modules_by_area: {
    label: "Solar modules that fit the usable area",
    unit: "pcs",
    formula: "modules = round down (usable area ÷ (module area × 1.10 spacing allowance))",
    inputs: [
      { name: "usableAreaM2", label: "Usable roof or ground area", unit: "m²", kind: "measurement", min: 1, max: 100000 },
      { name: "moduleAreaM2", label: "Module area (typical class)", unit: "m²", kind: "assumption", default: 2.2, min: 1, max: 4 },
    ],
    compute: (v) => Math.floor(v.usableAreaM2 / (v.moduleAreaM2 * 1.1) + 1e-9),
    explain: (v, q) => `${g(v.usableAreaM2)} m² ÷ (${g(v.moduleAreaM2)} m² × 1.10 spacing) = ${q} modules (rounded down)`,
  },
  cable_run: {
    label: "Cable for a measured run",
    unit: "m",
    formula: "cable = (measured run × 1.05 sag allowance + terminations allowance) × number of conductors",
    inputs: [
      { name: "runLengthM", label: "Measured run length", unit: "m", kind: "measurement", min: 0.5, max: 10000 },
      { name: "conductors", label: "Conductors in the run", unit: "", kind: "assumption", default: 2, min: 1, max: 6 },
      { name: "allowanceM", label: "Allowance for terminations", unit: "m", kind: "assumption", default: 2, min: 0, max: 20 },
    ],
    compute: (v) => ceil1((cableLengthWithSag(v.runLengthM, 1.05) + v.allowanceM) * v.conductors),
    explain: (v, q) => `(${g(v.runLengthM)} m × 1.05 sag + ${g(v.allowanceM)} m terminations) × ${g(v.conductors)} conductors = ${q} m`,
  },
  mounting_clamps: {
    label: "Module clamps",
    unit: "pcs",
    formula: "clamps = modules × clamps per module (allowance; refine with the layout)",
    inputs: [
      { name: "modules", label: "Number of modules", unit: "pcs", kind: "record", min: 1, max: 10000 },
      { name: "clampsPerModule", label: "Clamps per module (allowance)", unit: "pcs", kind: "assumption", default: 4, min: 2, max: 8 },
    ],
    compute: (v) => Math.ceil(v.modules * v.clampsPerModule - 1e-9),
    explain: (v, q) => `${g(v.modules)} modules × ${g(v.clampsPerModule)} clamps = ${q} clamps`,
  },
  cctv_storage_tb: {
    label: "Recorder storage for the retention wanted",
    unit: "TB",
    formula: "storage = cameras × bitrate × 86 400 s × days ÷ 8 ÷ 10⁶, plus 20% headroom",
    inputs: [
      { name: "cameras", label: "Number of cameras", unit: "pcs", kind: "record", min: 1, max: 500 },
      { name: "bitrateMbps", label: "Average bitrate per camera (typical)", unit: "Mbps", kind: "assumption", default: 4, min: 0.1, max: 50 },
      { name: "retentionDays", label: "Days of recordings wanted", unit: "days", kind: "assumption", default: 30, min: 1, max: 365 },
    ],
    compute: (v) => ceil1(((v.cameras * v.bitrateMbps * 86400 * v.retentionDays) / 8 / 1e6) * 1.2),
    explain: (v, q) => `${g(v.cameras)} cameras × ${g(v.bitrateMbps)} Mbps × 86 400 s × ${g(v.retentionDays)} days ÷ 8 ÷ 10⁶ × 1.2 headroom = ${q} TB`,
  },
  cctv_recorder_channels: {
    label: "Recorder channels",
    unit: "channels",
    formula: "channels = the next standard size (4, 8, 16, 32, 64) that holds all cameras",
    inputs: [{ name: "cameras", label: "Number of cameras", unit: "pcs", kind: "record", min: 1, max: 64 }],
    compute: (v) => nextOf([4, 8, 16, 32, 64], v.cameras) ?? NaN,
    explain: (v, q) => `${g(v.cameras)} cameras fit a ${q}-channel recorder (next standard size)`,
  },
  poe_ports: {
    label: "Network switch PoE ports",
    unit: "ports",
    formula: "ports = the next standard size (8, 16, 24, 48) that holds the cameras plus spare ports (the larger of 2 or the spare percentage)",
    inputs: [
      { name: "cameras", label: "Number of cameras", unit: "pcs", kind: "record", min: 1, max: 200 },
      { name: "sparePercent", label: "Spare ports (allowance)", unit: "%", kind: "assumption", default: 20, min: 0, max: 100 },
    ],
    compute: (v) => {
      const need = v.cameras + Math.max(2, Math.ceil((v.cameras * v.sparePercent) / 100 - 1e-9));
      return nextOf([8, 16, 24, 48], need) ?? Math.ceil(need / 48) * 48;
    },
    explain: (v, q) => `${g(v.cameras)} cameras + the larger of 2 or ${g(v.sparePercent)}% spare, rounded up to a standard switch = ${q} ports`,
  },
};

export const RULE_IDS = Object.keys(MATERIAL_RULES) as RuleId[];
export const isRuleId = (id: unknown): id is RuleId => typeof id === "string" && id in MATERIAL_RULES;

/** The rules as plain data (no functions), for the AI to choose from and for the screens to describe. */
export function ruleCatalog(): Array<{ id: RuleId; label: string; unit: string; formula: string; inputs: RuleInputDef[] }> {
  return RULE_IDS.map((id) => ({ id, label: MATERIAL_RULES[id].label, unit: MATERIAL_RULES[id].unit, formula: MATERIAL_RULES[id].formula, inputs: MATERIAL_RULES[id].inputs }));
}

export type RuleInputValue = { value: number; /** "record": found in the recorded data. "assumed": not recorded, supplied by the AI or the rule. */ from: "record" | "assumed" };

export type RuleResult =
  | { ok: true; ruleId: RuleId; quantity: number; unit: string; explanation: string; used: Array<{ name: string; label: string; value: number; unit: string; assumed: boolean }>; /** Labels of the inputs that were assumed. */ assumed: string[] }
  | { ok: false; ruleId: string; reason: string; /** Labels of inputs that are needed and were neither given nor have a typical value. */ missing: string[] };

/**
 * Run a rule. An input that is given and in range is used (as recorded or assumed, as stated). A missing or out-of-range input falls back
 * to the rule's typical value (marked assumed) when it has one; when it has none the rule cannot run and says what is missing.
 */
export function applyRule(id: string, given: Record<string, RuleInputValue | undefined>): RuleResult {
  if (!isRuleId(id)) return { ok: false, ruleId: id, reason: "Unknown rule", missing: [] };
  const rule = MATERIAL_RULES[id];
  const values: Record<string, number> = {};
  const used: Array<{ name: string; label: string; value: number; unit: string; assumed: boolean }> = [];
  const missing: string[] = [];
  for (const def of rule.inputs) {
    const v = given[def.name];
    const valid = v && Number.isFinite(v.value) && v.value >= def.min && v.value <= def.max;
    if (valid) {
      values[def.name] = v.value;
      used.push({ name: def.name, label: def.label, value: v.value, unit: def.unit, assumed: v.from === "assumed" });
    } else if (def.default !== undefined) {
      values[def.name] = def.default;
      used.push({ name: def.name, label: def.label, value: def.default, unit: def.unit, assumed: true });
    } else {
      missing.push(def.label);
    }
  }
  if (missing.length > 0) return { ok: false, ruleId: id, reason: `Needs: ${missing.join(", ")}`, missing };
  const quantity = rule.compute(values);
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, ruleId: id, reason: "The inputs give no usable quantity", missing: [] };
  return { ok: true, ruleId: id, quantity, unit: rule.unit, explanation: `${rule.label}: ${rule.explain(values, quantity)} (rule ${id} v${MATERIAL_RULES_VERSION})`, used, assumed: used.filter((u) => u.assumed).map((u) => u.label) };
}

/** What to show for a stored quantity: "TBD" when the item's quantity is not known, otherwise the number and unit. */
export function displayQuantity(item: { quantity: number; unit: string; assumptions?: string[] }): string {
  return (item.assumptions ?? []).some((a) => a.startsWith(QUANTITY_TBD)) ? "TBD" : `${item.quantity} ${item.unit}`.trim();
}
