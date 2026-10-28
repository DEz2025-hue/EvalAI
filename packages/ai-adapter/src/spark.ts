import { z } from "zod";
import { getAdapterConfig } from "./index";
import { metaFetch, modelFor } from "./client";
import { ClarifyContextInput, ClarifyContextOutput, ProposeChecklistInput, ProposeChecklistOutput } from "./schemas";

// Muse Spark — faster routine tasks: clarification questions, checklist proposal

export async function sparkClarifyContext(input: z.infer<typeof ClarifyContextInput>) {
  const cfg = getAdapterConfig();
  const validated = ClarifyContextInput.parse(input);
  const model = modelFor("clarifyContext", cfg);
  try {
    const raw = await metaFetch(cfg, "/v1/chat/completions", {
      model,
      messages: [
        { role: "system", content: "You are EvalAI. Ask only questions whose answers materially affect checklist, safety, or recommendations. Never guess missing facts. Output JSON: { questions: [{id, question, required, type, options?, rationale}], missingCritical, assumptions }." },
        { role: "user", content: JSON.stringify({ task: "clarifyContext", ...validated }) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
    const content = extractContent(raw);
    const obj = typeof content === "string" ? JSON.parse(content) : content;
    return ClarifyContextOutput.parse(obj);
  } catch {
    return { questions: [], missingCritical: ["Spark not verified — manual context required"], assumptions: ["Fallback"] };
  }
}

export async function sparkProposeChecklist(input: z.infer<typeof ProposeChecklistInput>) {
  const cfg = getAdapterConfig();
  const validated = ProposeChecklistInput.parse(input);
  const model = modelFor("proposeChecklist", cfg);
  try {
    const raw = await metaFetch(cfg, "/v1/chat/completions", {
      model,
      messages: [
        { role: "system", content: "Propose an editable checklist for the given mode/pack/context. Adapt to solar vs cctv, assessment vs inspection. Output JSON: { items: [{title, instructions?, required, category?, rationale?, source}], warnings }. Never claim certification." },
        { role: "user", content: JSON.stringify({ task: "proposeChecklist", ...validated }) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
    const content = extractContent(raw);
    const obj = typeof content === "string" ? JSON.parse(content) : content;
    return ProposeChecklistOutput.parse(obj);
  } catch {
    // Deterministic fallback template — not AI fabricated, clearly labelled
    return fallbackChecklist(validated.pack, validated.mode);
  }
}

function fallbackChecklist(pack: string, mode: string): z.infer<typeof ProposeChecklistOutput> {
  const solarBase: Array<z.infer<typeof ProposeChecklistOutput>["items"][number]> = [
    { title: "Site access & safety check", instructions: "Confirm safe access, PPE, isolation points.", required: true, category: "Safety", rationale: "Template fallback", source: "template" },
    { title: "Existing panels / inverter / batteries — inventory", required: true, category: "System", rationale: "Template fallback", source: "template" },
    { title: "Roof / mounting constraints", required: true, category: "Site", rationale: "Template fallback", source: "template" },
    { title: "Wiring & protection review", required: true, category: "Electrical", rationale: "Template fallback", source: "template" },
    { title: "Load & operating hours", required: true, category: "Demand", rationale: "Template fallback", source: "template" },
    { title: "Measurements — area, orientation, shading", required: false, category: "Measurements", rationale: "Template fallback", source: "template" },
  ];
  const cctvBase: Array<z.infer<typeof ProposeChecklistOutput>["items"][number]> = [
    { title: "Coverage goals & camera count", required: true, category: "Requirements", rationale: "Template fallback", source: "template" },
    { title: "Existing cameras / recorder / network", required: true, category: "System", rationale: "Template fallback", source: "template" },
    { title: "Power & cabling survey", required: true, category: "Site", rationale: "Template fallback", source: "template" },
    { title: "Retention & storage needs", required: false, category: "Data", rationale: "Template fallback", source: "template" },
  ];
  const items = pack === "solar" ? solarBase : cctvBase;
  if (mode === "inspection") items.forEach((i) => { const cur = i.instructions ?? ""; i.instructions = (cur ? cur + " " : "") + "Record status per item; attach evidence; unchecked ≠ pass."; });
  return { items, warnings: ["Fallback template — AI checklist pending live Spark verification"] };
}

function extractContent(raw: unknown): unknown {
  const r = raw as Record<string, unknown>;
  const c = r.choices as Array<Record<string, unknown>> | undefined;
  if (c?.[0]?.message) return (c[0].message as Record<string, unknown>).content;
  if (r.output) return r.output;
  return raw;
}
