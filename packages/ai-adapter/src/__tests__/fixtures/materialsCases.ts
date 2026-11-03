// Evaluation set for the materials proposal (D-029). Made-up jobs only. Used by an offline test (the automated checks work) and by the live
// run (materialsEval.live.test.ts), which asks the real model to propose materials so a person can read them against the rubric in TEST_PLAN.md.

import type { MaterialsProposal } from "../../materialsDraft";
import { numbersIn } from "../../figures";

const rules = [
  { id: "pv_modules_by_target", label: "Solar modules to reach a target size", unit: "pcs", formula: "modules = round up (target kW × 1000 ÷ module watts)", inputs: [{ name: "targetKw", label: "Target system size", unit: "kW", kind: "record", min: 0.1, max: 1000 }, { name: "moduleW", label: "Module rating (typical class)", unit: "W", kind: "assumption", default: 450, min: 100, max: 800 }] },
  { id: "pv_modules_by_area", label: "Solar modules that fit the usable area", unit: "pcs", formula: "modules = round down (usable area ÷ (module area × 1.10))", inputs: [{ name: "usableAreaM2", label: "Usable roof or ground area", unit: "m²", kind: "measurement", min: 1, max: 100000 }, { name: "moduleAreaM2", label: "Module area (typical class)", unit: "m²", kind: "assumption", default: 2.2, min: 1, max: 4 }] },
  { id: "cable_run", label: "Cable for a measured run", unit: "m", formula: "cable = (run × 1.05 + terminations) × conductors", inputs: [{ name: "runLengthM", label: "Measured run length", unit: "m", kind: "measurement", min: 0.5, max: 10000 }, { name: "conductors", label: "Conductors in the run", unit: "", kind: "assumption", default: 2, min: 1, max: 6 }, { name: "allowanceM", label: "Allowance for terminations", unit: "m", kind: "assumption", default: 2, min: 0, max: 20 }] },
  { id: "mounting_clamps", label: "Module clamps", unit: "pcs", formula: "clamps = modules × clamps per module", inputs: [{ name: "modules", label: "Number of modules", unit: "pcs", kind: "record", min: 1, max: 10000 }, { name: "clampsPerModule", label: "Clamps per module", unit: "pcs", kind: "assumption", default: 4, min: 2, max: 8 }] },
  { id: "cctv_storage_tb", label: "Recorder storage", unit: "TB", formula: "cameras × bitrate × 86 400 × days ÷ 8 ÷ 10⁶ × 1.2", inputs: [{ name: "cameras", label: "Number of cameras", unit: "pcs", kind: "record", min: 1, max: 500 }, { name: "bitrateMbps", label: "Average bitrate per camera", unit: "Mbps", kind: "assumption", default: 4, min: 0.1, max: 50 }, { name: "retentionDays", label: "Days of recordings wanted", unit: "days", kind: "assumption", default: 30, min: 1, max: 365 }] },
  { id: "cctv_recorder_channels", label: "Recorder channels", unit: "channels", formula: "next standard size that holds all cameras", inputs: [{ name: "cameras", label: "Number of cameras", unit: "pcs", kind: "record", min: 1, max: 64 }] },
  { id: "poe_ports", label: "Network switch PoE ports", unit: "ports", formula: "next standard switch size that holds the cameras plus spares", inputs: [{ name: "cameras", label: "Number of cameras", unit: "pcs", kind: "record", min: 1, max: 200 }, { name: "sparePercent", label: "Spare ports", unit: "%", kind: "assumption", default: 20, min: 0, max: 100 }] },
];

type Row = { title: string; status: string; notes?: string; category?: string; required?: boolean };

export type MaterialsCase = {
  id: string;
  title: string;
  tests: string;
  /** Existing systems: every item must be tied to something in the record, and no full new system proposed. */
  existing: boolean;
  input: {
    workspaceId: string;
    assessmentId: string;
    siteName: string;
    mode: "assessment" | "inspection";
    pack: "solar" | "cctv";
    scenario: "new_install" | "existing";
    goal?: string;
    siteBrief?: { goal?: string; existingEquipment?: string; constraints?: string; intakeText?: string };
    checklist: Row[];
    findings: Array<{ title: string; severity?: string; description?: string }>;
    findingsAwaitingReview: number;
    measurements: Array<{ name: string; value: number; unit: string }>;
    limitations: string[];
    photos: [];
    existingMaterials: Array<{ description: string }>;
    rules: typeof rules;
  };
};

const base = { workspaceId: "eval", mode: "assessment" as const, photos: [] as [], existingMaterials: [], rules, findingsAwaitingReview: 0 };

export const MATERIALS_CASES: MaterialsCase[] = [
  {
    id: "solar-new",
    title: "New rooftop solar, 5 kW wanted, roof and cable run measured",
    tests: "Rules used for modules, clamps and cable; module rating and conductors marked as assumptions; protection and inverter say 'to be sized'",
    existing: false,
    input: {
      ...base,
      assessmentId: "m1",
      siteName: "Hillside School (made up)",
      pack: "solar",
      scenario: "new_install",
      goal: "A 5 kW grid-tied rooftop array for the school hall",
      siteBrief: { goal: "A 5 kW grid-tied rooftop array for the school hall", intakeText: "Corrugated iron roof facing north, main board in a store room next to the hall" },
      checklist: [
        { title: "Roof / structure / mounting constraints", status: "pass", notes: "Corrugated iron, good condition", category: "Site", required: true },
        { title: "Electrical supply — main board", status: "pass", notes: "Single phase board with space for a new breaker", category: "Electrical", required: true },
        { title: "Load audit", status: "not_checked", category: "Customer", required: true },
      ],
      findings: [],
      measurements: [{ name: "Usable roof area", value: 42.5, unit: "m²" }, { name: "Inverter to main board run", value: 18, unit: "m" }],
      limitations: ["Load audit: not checked yet (required)"],
    },
  },
  {
    id: "solar-existing",
    title: "Existing solar system with cracked modules and a missing earth strap",
    tests: "Only repair parts for what is flagged; each item tied to a finding or item; no whole new system",
    existing: true,
    input: {
      ...base,
      assessmentId: "m2",
      siteName: "Corner Bakery (made up)",
      mode: "inspection",
      pack: "solar",
      scenario: "existing",
      goal: "Find out why the system stopped producing",
      siteBrief: { goal: "Find out why the system stopped producing", existingEquipment: "Roof array with a string inverter, installed several years ago" },
      checklist: [
        { title: "Wiring, protection & earthing review", status: "fail", notes: "Earth strap missing at the main board", category: "Electrical", required: true },
        { title: "Modules — condition", status: "needs_attention", notes: "Two modules with cracked glass at the lower edge", category: "System", required: true },
        { title: "Inverter — display and faults", status: "pass", notes: "Running, no fault codes", category: "System", required: true },
      ],
      findings: [{ title: "Missing earth strap", severity: "high", description: "No earth strap was visible at the main board." }, { title: "Cracked modules", severity: "medium", description: "Two modules show cracked glass." }],
      measurements: [],
      limitations: [],
    },
  },
  {
    id: "cctv-new",
    title: "New CCTV for a shop, 6 cameras, 30 days of recordings",
    tests: "Rules used for recorder channels, PoE ports and storage; record figures (6 cameras, 30 days) marked as from the record; no brands",
    existing: false,
    input: {
      ...base,
      assessmentId: "m3",
      siteName: "Main Street Hardware (made up)",
      pack: "cctv",
      scenario: "new_install",
      goal: "6 cameras covering the entrance, the till, the stock room and the yard, keep 30 days of recordings",
      siteBrief: { goal: "6 cameras covering the entrance, the till, the stock room and the yard, keep 30 days of recordings", intakeText: "Single-storey shop with a ceiling void, network cabinet behind the till" },
      checklist: [
        { title: "Camera positions and coverage", status: "pass", notes: "Six positions agreed with the owner", category: "Site", required: true },
        { title: "Cable routes", status: "needs_attention", notes: "Ceiling void is accessible, yard run is outside", category: "Site", required: true },
      ],
      findings: [],
      measurements: [{ name: "Yard camera cable run", value: 35, unit: "m" }],
      limitations: [],
    },
  },
  {
    id: "cctv-existing",
    title: "Existing CCTV with two dead cameras and a short recording period",
    tests: "Replacement parts only; storage handled without inventing the disk size; items tied to the findings",
    existing: true,
    input: {
      ...base,
      assessmentId: "m4",
      siteName: "Riverside Clinic (made up)",
      mode: "inspection",
      pack: "cctv",
      scenario: "existing",
      goal: "Fix the cameras that stopped working",
      siteBrief: { goal: "Fix the cameras that stopped working", existingEquipment: "Eight cameras on a recorder in the server cupboard" },
      checklist: [
        { title: "Camera image check", status: "fail", notes: "Two cameras show no image", category: "System", required: true },
        { title: "Recorder — storage and recording days", status: "needs_attention", notes: "Recorder only keeps about a week of recordings", category: "System", required: true },
      ],
      findings: [{ title: "Two cameras offline", severity: "high", description: "Cameras at the car park and the side door show no image." }],
      measurements: [],
      limitations: ["Cable condition behind the walls was not checked"],
    },
  },
];

const CURRENCY = /[$€£]\s?\d|\b\d[\d,]*(?:\.\d+)?\s?(?:usd|aud|eur|gbp|ngn|zar|kes|ghs)\b/i;
const BRANDS = /\b(huawei|hikvision|dahua|sma|victron|fronius|jinko|longi|trina|canadian solar|axis|sungrow|growatt|solaredge|enphase|tesla|reolink|uniview|ubiquiti|unifi|tp-link|samsung|lg)\b/i;
const MODEL_NUMBER = /\b[A-Z]{2,}[- ]?\d{2,}[A-Z0-9-]*\b/;
const SIZING = /\b(breaker|fuse|isolator|inverter|battery|surge|rcd|mcb|protection)\b/i;
const RATING = /\b\d+(?:\.\d+)?\s?(?:a|amp|amps|ka|kva|kw|v|ah|kwh)\b/i;

/** Automated checks for one proposal. `problems` should be empty; `notes` are for the person reading. */
export function checkMaterials(c: MaterialsCase, p: MaterialsProposal): { problems: string[]; notes: string[] } {
  const problems: string[] = [];
  const notes: string[] = [];
  const record = numbersIn([c.input.goal, c.input.siteBrief, c.input.checklist, c.input.measurements, c.input.limitations]);
  const text = (i: MaterialsProposal["items"][number]) => [i.description, i.specification, i.rationale, ...i.assumptions].join(" ");
  if (p.items.length === 0) problems.push("No items were proposed");
  if (p.designBasis.length < 40) problems.push("The design basis is missing or too short");
  if (CURRENCY.test(p.designBasis)) problems.push("A price appears in the design basis");
  for (const i of p.items) {
    const where = `"${i.description}"`;
    if (CURRENCY.test(text(i))) problems.push(`${where}: a price or cost appears`);
    if (BRANDS.test(text(i))) problems.push(`${where}: a brand is named`);
    if (MODEL_NUMBER.test(i.specification)) problems.push(`${where}: the specification has a model or part number`);
    if (SIZING.test(i.description)) {
      if (RATING.test(i.specification)) {
        // A rating is only allowed if the figure is in the record.
        const nums = (i.specification.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
        if (nums.some((n) => !record.has(n))) problems.push(`${where}: a rating was given for an item that needs sizing`);
      }
      if (!/qualified designer|to be (sized|confirmed)/i.test(i.specification)) problems.push(`${where}: a sizing-dependent item does not say it is to be sized or confirmed`);
    }
    if (i.method === "estimate" && !i.assumptions.length) problems.push(`${where}: an estimate has no assumption`);
    if (i.method === "unknown" && !i.assumptions.length && !p.missingInputs.length) notes.push(`${where}: unknown quantity with nothing said about what is missing`);
    if (i.method === "rule") {
      const rule = c.input.rules.find((r) => r.id === i.ruleId);
      if (!rule) problems.push(`${where}: names a rule that does not exist`);
      else {
        for (const inp of i.ruleInputs) {
          if (!rule.inputs.some((d) => d.name === inp.name)) problems.push(`${where}: gives an input the rule does not have (${inp.name})`);
          if (inp.from === "record" && !inp.measurement && !record.has(inp.value)) problems.push(`${where}: says ${inp.name}=${inp.value} is from the record but it is not`);
        }
      }
    }
    if (c.existing && i.basis.length === 0) problems.push(`${where}: an item for an existing system is not tied to any finding, checklist item or measurement`);
  }
  if (c.existing && p.items.length > 12) problems.push(`${p.items.length} items proposed for an existing system: this looks like a whole new system`);
  if (p.unverifiedFigures.length) notes.push(`Figures not in the record: ${p.unverifiedFigures.join("; ")}`);
  if (p.duplicates.length) notes.push(`Left out as duplicates: ${p.duplicates.join("; ")}`);
  return { problems, notes };
}
