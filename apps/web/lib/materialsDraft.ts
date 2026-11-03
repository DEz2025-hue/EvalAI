import { QUANTITY_TBD, applyRule, type RuleInputValue, type RuleResult } from "@eval-ai/shared";
import type { MaterialsProposal, ProposedMaterial } from "@eval-ai/ai-adapter";

// Turns the AI's materials proposal into draft list items (D-029). The AI chose rules and inputs; the arithmetic happens HERE, in code.
// Nothing is saved: the person reviews the draft, edits it and saves it as a new list version.

export type DraftMaterialItem = {
  group: string;
  description: string;
  specification: string;
  quantity: number;
  unit: string;
  rationale: string;
  source: "ai_suggested";
  provisional: boolean;
  assumptions: string[];
  /** True when no quantity could be given: quantity is a placeholder 1 and the screens show TBD. */
  quantityTbd: boolean;
  method: "rule" | "estimate" | "unknown";
  ruleId?: string;
  basis: ProposedMaterial["basis"];
};

export type MaterialsDraft = {
  designBasis: string;
  items: DraftMaterialItem[];
  missingInputs: string[];
  assumptions: string[];
  duplicates: string[];
  dropped: string[];
  unverifiedFigures: string[];
};

const cap = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…");
const num = (n: number) => String(Math.round(n * 100) / 100);

function resolveItem(it: ProposedMaterial, missing: Set<string>): DraftMaterialItem {
  const common = { group: it.group, description: it.description, specification: it.specification, source: "ai_suggested" as const, method: it.method, ruleId: it.ruleId, basis: it.basis };
  const aiAssumptions = it.assumptions.map((a) => cap(a, 500));

  if (it.method === "rule" && it.ruleId) {
    const given: Record<string, RuleInputValue> = {};
    for (const i of it.ruleInputs) given[i.name] = { value: i.value, from: i.from };
    const r = applyRule(it.ruleId, given);
    if (r.ok) {
      const assumed = r.used.filter((u) => u.assumed).map((u) => cap(`Assumed ${u.label.toLowerCase()}: ${num(u.value)}${u.unit ? " " + u.unit : ""} (not recorded)`, 500));
      return {
        ...common,
        quantity: r.quantity,
        unit: r.unit,
        rationale: cap(`${it.rationale} Quantity: ${r.explanation}.`, 1000),
        // Provisional unless the rule ran entirely on recorded values.
        provisional: assumed.length > 0,
        assumptions: [...aiAssumptions, ...assumed].slice(0, 20),
        quantityTbd: false,
      };
    }
    // The rule could not run: say what is missing, and keep the item with an unknown quantity.
    const failed = r as Extract<RuleResult, { ok: false }>; // the web app's loose type settings do not narrow the union
    for (const m of failed.missing) missing.add(`${m} (needed for ${it.description})`);
    return { ...common, quantity: 1, unit: it.unit || "pcs", rationale: it.rationale, provisional: true, assumptions: [...aiAssumptions, cap(`${QUANTITY_TBD}: ${failed.reason}`, 500)].slice(0, 20), quantityTbd: true, method: "unknown" };
  }

  if (it.method === "estimate" && it.estimate && it.estimate > 0) {
    return { ...common, quantity: it.estimate, unit: it.unit, rationale: it.rationale, provisional: true, assumptions: [...aiAssumptions, "AI estimate, not calculated from a rule or a measurement; confirm before ordering"].slice(0, 20), quantityTbd: false };
  }

  return { ...common, quantity: 1, unit: it.unit || "pcs", rationale: it.rationale, provisional: true, assumptions: [...(aiAssumptions.some((a) => a.startsWith(QUANTITY_TBD)) ? aiAssumptions : [...aiAssumptions, `${QUANTITY_TBD}: not enough is recorded to give a quantity`])].slice(0, 20), quantityTbd: true, method: "unknown" };
}

export function resolveMaterialsProposal(p: MaterialsProposal): MaterialsDraft {
  const missing = new Set(p.missingInputs);
  const items = p.items.map((i) => resolveItem(i, missing));
  return { designBasis: p.designBasis, items, missingInputs: [...missing], assumptions: p.assumptions, duplicates: p.duplicates, dropped: p.dropped, unverifiedFigures: p.unverifiedFigures };
}
