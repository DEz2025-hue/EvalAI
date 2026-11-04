import { z } from "zod";
import { getAdapterConfig } from "./config";
import { AiAdapterError } from "./client";
import { situationHint } from "./situation";
import { chatJson, type CallOptions } from "./chat";
import { materialsSchema } from "./jsonSchemas";
import { ProposeMaterialsInput } from "./schemas";
import { SYSTEM_GUARD, compact } from "./text";
import { findUnverifiedFigures, numbersIn } from "./figures";
import { capText } from "./keyFindings";

// Materials proposal (D-029). The AI reads the whole record and proposes materials for the job. It proposes; code calculates (the route
// runs the documented rules); the person decides. Nothing here prices anything, and nothing is saved.

export const MATERIALS_LIMITS = { designBasis: 4000, rationale: 600, specification: 400, description: 200, assumption: 300, items: 40 } as const;

/** The rules for the materials analysis. Exported so tests can check the guard rails are present. */
export const MATERIALS_ANALYST_PROMPT =
  " You are a solar and CCTV installation estimator preparing a DRAFT materials list for a person to review, from the whole saved record of this job: the site brief, the situation, checklist results and notes, measurements, confirmed findings, photo notes and limitations. " +
  "Analyse the installation as a whole, then propose the materials the project needs. " +
  "design_basis: a short plain description of the system you are assuming and why, saying which parts of it come from the record and which are your assumptions. " +
  "For a NEW installation propose the full set of materials, grouped by area. Solar: modules, inverter, mounting, DC cable, AC cable, protection, earthing and bonding, monitoring, batteries only if the record asks for storage, and consumables. CCTV: cameras, recorder and storage, network switch and PoE, cable and containment, mounts and enclosures, power supply, and signage. " +
  "For an EXISTING system propose only repair or replacement parts for what the findings and checklist issues flag, plus what is needed to complete the work; do not propose a whole new system. " +
  "Each item: group; a short description; a specification given as a GENERAL CLASS only (for example 'UV-resistant solar DC cable, 4 mm² class, to be confirmed by the designer'). Never give a brand, model, manufacturer or part number, and never give a price, cost or supplier. Anything whose size depends on a calculation (breakers, fuses, cable cross-section for a current, inverter rating, battery capacity) must say 'to be sized by a qualified designer' and must not carry a rating you invented. That includes a cable size such as '4 mm2' in the specification: say 'cable, cross-section to be sized by a qualified designer'. " +
  "Quantity: choose a quantity_method for every item. " +
  "'rule': the item matches one of the documented rules in the rules list. Give rule_id and its rule_inputs by name. For each input say where it comes from: 'measurement' (give measurement_name exactly as supplied in measurements), 'record' (a figure that appears in the goal, site brief, notes or answers, for example the system size the client wants) or 'assumed' (a typical value you chose). You do NOT calculate the quantity: code does that from your inputs. " +
  "'estimate': no rule applies but you can give a sensible quantity; set estimate_quantity and unit. State the assumption behind it in assumptions. " +
  "'unknown': you cannot responsibly give a quantity; leave estimate_quantity 0 and say in assumptions what is missing. Prefer 'unknown' to a guess, and use the rules whenever one applies. " +
  "rationale: why this item is needed, tied to the record. Use item_titles (checklist item titles exactly as supplied), finding_titles (confirmed findings exactly as supplied) and measurement_names (exactly as supplied) to say what supports it. " +
  "missing_inputs: the facts that would let you be more exact (for example roof area, cable route lengths, number of cameras, retention days); say them as things to measure or confirm. " +
  "Each checklist item may carry answers: what the person recorded in plain fields, as facts. An answer with concern true means that thing still needs dealing with, so include the materials it calls for (for example earthing when earthing is not installed) and say it needs confirming. " +
  "Rules: never invent site facts, measurements, counts, sizes or ratings that are not in the data, and never state a price. Do not name standards, codes or clause numbers. Do not repeat anything in existingMaterials. An item that is Not Checked has not been checked: do not treat it as evidence. photoNotes are UNVERIFIED AI descriptions of photos; you may mention them in a rationale as 'appears to', never as confirmed fact. " +
  "Everything you propose is a draft for a person to confirm; it is not a quotation and not a design.";

const blank = (s: unknown) => (typeof s === "string" ? s.trim() : "");
const list = (a: unknown, max = 20) => (Array.isArray(a) ? a : []).map(blank).filter(Boolean).slice(0, max);
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Removed from specifications: a currency amount, or a model-number style token like "ABC-1234X".
const PRICE = /[$€£]\s?\d|\b\d[\d,]*(?:\.\d+)?\s?(?:usd|aud|eur|gbp|ngn|zar|kes|ghs)\b/i;
const MODEL_NUMBER = /\b[A-Z]{2,}[- ]?\d{2,}[A-Z0-9-]*\b/;

export type RuleInputRef = { name: string; value: number; /** "record": a recorded measurement or a figure that is in the record. "assumed": the model's or the rule's typical value. */ from: "record" | "assumed"; measurement?: string };

export type ProposedMaterial = {
  group: string;
  description: string;
  specification: string;
  method: "rule" | "estimate" | "unknown";
  ruleId?: string;
  ruleInputs: RuleInputRef[];
  /** The model's own number for an estimate. Never set for a rule item. */
  estimate?: number;
  unit: string;
  rationale: string;
  assumptions: string[];
  basis: Array<{ kind: "item" | "finding" | "measurement"; ref: string }>;
};

export type MaterialsProposal = {
  designBasis: string;
  missingInputs: string[];
  assumptions: string[];
  items: ProposedMaterial[];
  /** Descriptions left out because the list already has them. */
  duplicates: string[];
  /** Items the model wrote that were left out (no description or rationale). */
  dropped: string[];
  unverifiedFigures: string[];
  requiresHumanReview: true;
};

type RuleData = z.infer<typeof ProposeMaterialsInput>["rules"][number];

const UNIT_ALIASES: Record<string, string> = { m2: "m²", sqm: "m²", meter: "m", metre: "m", meters: "m", metres: "m", kwp: "kw" };
const unitKey = (u: string) => {
  const k = u.trim().toLowerCase();
  return UNIT_ALIASES[k] ?? k;
};

/** Resolve one input the model gave for a rule: a measurement or figure stays "record" only if it really is in the record. */
function resolveInput(raw: Record<string, unknown>, rule: RuleData, measurements: Array<{ name: string; value: number; unit: string }>, recordNumbers: Set<number>): RuleInputRef | null {
  const name = blank(raw.name);
  const def = rule.inputs.find((i) => i.name === name);
  if (!def) return null;
  const value = Number(raw.value);
  const source = blank(raw.source);
  if (source === "measurement") {
    const wanted = norm(blank(raw.measurement_name));
    const m = measurements.find((x) => norm(x.name) === wanted);
    // A recorded measurement is used at its recorded value, never the model's copy of it, and only when its unit is the rule's unit.
    if (m && unitKey(m.unit) === unitKey(def.unit)) return { name, value: m.value, from: "record", measurement: m.name };
    return Number.isFinite(value) ? { name, value, from: "assumed" } : null;
  }
  if (!Number.isFinite(value)) return null;
  if (source === "record" && recordNumbers.has(value)) return { name, value, from: "record" };
  // A figure claimed to be from the record that is not in it is an assumption, not a fact.
  return { name, value, from: "assumed" };
}

export function cleanMaterials(
  raw: unknown,
  ctx: { rules: RuleData[]; checklistTitles: string[]; findingTitles: string[]; measurements: Array<{ name: string; value: number; unit: string }>; recordNumbers: Set<number>; existing: string[] },
): { items: ProposedMaterial[]; duplicates: string[]; dropped: string[] } {
  const items: ProposedMaterial[] = [];
  const duplicates: string[] = [];
  const dropped: string[] = [];
  const have = new Set(ctx.existing.map(norm));
  const seen = new Set<string>();
  const known = (title: string, pool: string[]) => pool.find((t) => norm(t) === norm(title));
  for (const r of (Array.isArray(raw) ? raw : []).slice(0, MATERIALS_LIMITS.items)) {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const description = capText(blank(o.description), MATERIALS_LIMITS.description);
    const rationale = capText(blank(o.rationale), MATERIALS_LIMITS.rationale);
    if (!description || !rationale) {
      dropped.push(description || "(no description)");
      continue;
    }
    const key = norm(description);
    if (have.has(key) || seen.has(key)) {
      duplicates.push(description);
      continue;
    }
    seen.add(key);
    let specification = capText(blank(o.specification), MATERIALS_LIMITS.specification);
    // A price or a model number in a specification is never kept: the spec is a general class (D-029).
    if (PRICE.test(specification) || MODEL_NUMBER.test(specification)) specification = "";
    const assumptions = list(o.assumptions, 8).map((a) => capText(a, MATERIALS_LIMITS.assumption));
    const unit = capText(blank(o.unit), 20);
    const basis: ProposedMaterial["basis"] = [
      ...list(o.item_titles).flatMap((t) => {
        const k = known(t, ctx.checklistTitles);
        return k ? [{ kind: "item" as const, ref: k }] : [];
      }),
      ...list(o.finding_titles).flatMap((t) => {
        const k = known(t, ctx.findingTitles);
        return k ? [{ kind: "finding" as const, ref: k }] : [];
      }),
      ...list(o.measurement_names).flatMap((t) => {
        const k = known(t, ctx.measurements.map((m) => m.name));
        return k ? [{ kind: "measurement" as const, ref: k }] : [];
      }),
    ];
    const base = { group: capText(blank(o.group), 60) || "Other", description, specification, rationale, assumptions, basis };
    const method = blank(o.quantity_method);
    const rule = ctx.rules.find((x) => x.id === blank(o.rule_id));
    if (method === "rule" && rule) {
      const inputs = (Array.isArray(o.rule_inputs) ? o.rule_inputs : []).flatMap((i) => {
        const res = resolveInput((i ?? {}) as Record<string, unknown>, rule, ctx.measurements, ctx.recordNumbers);
        return res ? [res] : [];
      });
      items.push({ ...base, method: "rule", ruleId: rule.id, ruleInputs: inputs, unit: rule.unit });
      continue;
    }
    // A rule item that names no real rule cannot be calculated: keep it as an estimate if it has a number, otherwise unknown.
    const n = Number(o.estimate_quantity);
    if ((method === "estimate" || method === "rule") && Number.isFinite(n) && n > 0 && unit) {
      items.push({ ...base, method: "estimate", ruleInputs: [], estimate: n, unit });
    } else {
      items.push({ ...base, method: "unknown", ruleInputs: [], unit: unit || "pcs" });
    }
  }
  return { items, duplicates, dropped };
}

export async function proposeMaterials(input: z.input<typeof ProposeMaterialsInput>, options?: CallOptions): Promise<MaterialsProposal> {
  const v = ProposeMaterialsInput.parse(input);
  const cfg = getAdapterConfig();
  const photoNotes = v.photos.map((p, i) => ({ number: i + 1, itemTitle: p.itemTitle, caption: p.caption, observations: p.observations, possibleIssues: p.possibleIssues }));
  const brief = v.siteBrief ?? {};
  const { data } = await chatJson(
    cfg,
    "proposeMaterials",
    {
      system: SYSTEM_GUARD + MATERIALS_ANALYST_PROMPT,
      user: JSON.stringify({
        task: "proposeMaterials",
        siteName: v.siteName,
        mode: v.mode,
        pack: v.pack,
        situation: situationHint(v.scenario),
        goal: v.goal,
        siteBrief: compact(brief),
        checklist: compact(v.checklist),
        confirmedFindings: compact(v.findings),
        findingsAwaitingReview: v.findingsAwaitingReview,
        measurements: compact(v.measurements),
        limitations: compact(v.limitations),
        photoNotes: compact(photoNotes),
        existingMaterials: compact(v.existingMaterials),
        rules: v.rules.map((r) => ({ id: r.id, label: r.label, unit: r.unit, formula: r.formula, inputs: r.inputs.map((i) => ({ name: i.name, label: i.label, unit: i.unit, kind: i.kind })) })),
      }),
      schemaName: "materials_proposal",
      schema: materialsSchema(),
    },
    options,
  );
  const raw = data as Record<string, unknown>;
  // Figures the record holds (system size wanted, cameras, days of recordings): a "record" input must be one of these.
  const recordNumbers = numbersIn([v.goal, brief, v.checklist, v.measurements, v.limitations]);
  const { items, duplicates, dropped } = cleanMaterials(raw.items, {
    rules: v.rules,
    checklistTitles: v.checklist.map((c) => c.title),
    findingTitles: v.findings.map((f) => f.title),
    measurements: v.measurements as Array<{ name: string; value: number; unit: string }>,
    recordNumbers,
    existing: v.existingMaterials.map((m) => m.description),
  });
  const designBasis = capText(blank(raw.design_basis), MATERIALS_LIMITS.designBasis);
  if (!designBasis && items.length === 0) throw new AiAdapterError("The AI did not produce a materials proposal", "invalid_response");
  // D-010: flag any figure with a unit, % or amount that is not in the record. Specifications are general classes and are not checked.
  const written = [designBasis, ...items.flatMap((i) => [i.rationale, ...i.assumptions])].join("\n\n");
  const unverifiedFigures = findUnverifiedFigures(written, [v, v.siteName]);
  return { designBasis, missingInputs: list(raw.missing_inputs), assumptions: list(raw.assumptions), items, duplicates, dropped, unverifiedFigures, requiresHumanReview: true };
}
