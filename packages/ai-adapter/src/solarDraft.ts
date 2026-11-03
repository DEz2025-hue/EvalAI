import { z } from "zod";
import { getAdapterConfig } from "./config";
import { AiAdapterError } from "./client";
import { situationHint } from "./situation";
import { chatJson, type CallOptions } from "./chat";
import { solarPlanSchema, solarWriteSchema } from "./jsonSchemas";
import { DraftReportInput } from "./schemas";
import { SYSTEM_GUARD, compact } from "./text";
import { findUnverifiedFigures } from "./figures";
import { capText } from "./keyFindings";
import { REPORT_SECTION_MAX } from "./reportDraft";

// The solar design and sizing proposal (D-036), in two calls like the CCTV design (D-034). Step 1, the PLAN: the load schedule (from the
// load audit, label readings in the photo notes and what the client said), the sizing assumptions and where the panels go. The app then
// works out every size in code. Step 2, the WRITE-UP: the summary, site description, options, other equipment, installation, open items and
// next steps, written around the sizing it is given. The model never does the arithmetic and never states a size of its own.

const SOLAR_RULES =
  "Two kinds of content, kept apart. SITE FACTS (the roof, the supply, existing equipment, the appliances and what their labels say) come ONLY from the record; never invent an appliance, a roof, a reading or a measurement. " +
  "DESIGN CHOICES (system type, which loads to back up, sizing assumptions, where panels go) are a professional proposal: make them confidently, as a solar designer would for the client to approve, and mark which ones are assumptions. " +
  "Rules: no prices or costs; no standards, codes or clause numbers; never say the design or the site complies with anything. Never use the words 'compliance', 'compliant' or 'complies'. " +
  "siteBrief.interview holds what the person said: use it as the client's wishes and statements, not as verified facts. " +
  "photoNotes are UNVERIFIED descriptions an AI wrote from the photos. Lines starting 'Label reading' quote text printed on an appliance or equipment label: use them as the best source for a load's power, and say so. " +
  "Write in plain, short, professional sentences in the third person.";

/** Step 1: the loads, the sizing assumptions and the panel placement. */
export const SOLAR_PLAN_PROMPT =
  " You are an experienced solar PV designer preparing a design for a NEW installation from the saved record of the site visit (the load audit and other checklist notes, the site brief, the interview, measurements and photo notes). " +
  SOLAR_RULES +
  " loads: the load schedule, one row per kind of appliance: name (plain, for example 'Split air conditioner 1.5 hp, bedroom'), quantity, watts = running power of ONE unit, hours_per_day = typical daily running hours, source, motor = true for loads with a start-up surge (air conditioners, fridges, freezers, pumps, motors), note. " +
  "Power: use a label reading when there is one, converting cooling capacity to electrical power only when the label gives the input power or current and voltage (watts = volts x amps); a cooling capacity in BTU/h is NOT the electrical power. Otherwise use what the client said, otherwise a typical value for that kind of appliance and say so (source typical). Hours: what the client said, otherwise a typical value as an assumption. Include every load the record mentions; add common household or business loads only when the record suggests them, as assumptions. " +
  "inputs: system_type (grid_tied when the client wants to cut bills and has reliable grid; hybrid when they want backup during outages; off_grid when there is no grid), and the sizing values, each with value, basis (client, site or assumption) and a short note: peak_sun_hours (typical for the site's location if known from the address; otherwise an assumption and say the location is needed), system_losses (0.2 to 0.3 typical), panel_watts, battery_voltage, depth_of_discharge (about 0.8 for lithium, 0.5 for lead-acid), autonomy_days (hybrid backup is often 0.3 to 1 day; off-grid 1 to 3), simultaneity (share of the connected load running at once, often 0.5 to 0.8). " +
  "placement: two to five lines on where the panels should go and why, from the roof survey and roof photos (which part of the roof is largest, clearest and least shaded, what to avoid). If the roof was not seen, say the placement needs a roof survey. " +
  "basis: the decisions the design rests on (system type and why, what the battery must back up, budget or space limits the client stated, the roof chosen), with basis client, site or assumption. " +
  "Do NOT calculate the daily energy, array, panel count, inverter or battery size: the app works them out from your loads and inputs.";

/** Step 2: the write-up around the sizing the app worked out. */
export const SOLAR_WRITE_PROMPT =
  " You are an experienced solar PV designer finishing a design proposal for a NEW installation. The load schedule, the sizing inputs and the SIZING the app worked out from them are SETTLED: the person may have edited them. Do not change, recalculate or re-argue them; use the sizes exactly as given when you mention them. " +
  SOLAR_RULES +
  " summary: 120 to 220 words for the client: what the site is and what they want, the proposed system in plain words (system type, the array, inverter and battery in the sizing's own figures, where the panels go), the largest loads and what drives the size, and what must be confirmed before installation. " +
  "site_overview: one to three short paragraphs on the site as recorded: the building and roof, the electrical supply, existing equipment, the space for the inverter and batteries. Do not repeat the summary. " +
  "options: two to four real choices the client could make, each as area (the topic), gap (what the choice is about) and option (what it would change), for example backing up only essential loads to shrink the battery, replacing old air conditioners with inverter models to cut the daily energy, adding panels later. Do not give new sizes for them. " +
  "equipment: everything EXCEPT the panels, inverter and battery (the app lists those from the sizing): mounting rails and fixings, DC and AC cabling, DC and AC isolators and breakers, surge protection, combiner box, earthing, battery rack or cabinet, monitoring, metering, conduit. quantity: a count only when it follows from the design; otherwise 'to be sized after the survey'. specification: the requirement, not a brand model, unless the client named a brand. " +
  "installation: the phases in order, one line each. " +
  "open_items: everything that must be confirmed before installation: every load whose source is typical or assumption, every input marked assumption, roof strength and condition, cable route lengths, the location's sun hours, approvals, costs. status: 'Survey needed', 'To be confirmed', 'To be confirmed on site', 'Check after the first month' or 'To follow'. " +
  "next_steps: 3 to 6 concrete steps to turn this draft into a final design. " +
  "missing_information: the few facts that would most improve the sizing. assumptions: the assumptions made, also listed in open_items.";

const blank = (s: unknown) => (typeof s === "string" ? s.trim() : "");
const list = (a: unknown) => (Array.isArray(a) ? a : []).map(blank).filter(Boolean).slice(0, 20);
const arr = (a: unknown): Array<Record<string, unknown>> => (Array.isArray(a) ? a.filter((x) => x && typeof x === "object") : []);

function recordOf(v: z.output<typeof DraftReportInput>) {
  const photoNotes = v.photos.map((p, i) => ({ number: i + 1, itemTitle: p.itemTitle, caption: p.caption, observations: p.observations, possibleIssues: p.possibleIssues, cannotTell: p.cannotTell }));
  const facts = { siteBrief: v.siteBrief ?? {}, checklist: v.checklist, confirmedFindings: v.findings, measurements: v.measurements, limitations: v.limitations, materials: v.materials, photoNotes };
  const message = {
    siteName: v.siteName,
    pack: v.pack,
    situation: situationHint(v.scenario),
    goal: v.goal,
    siteBrief: compact(facts.siteBrief),
    checklist: compact(v.checklist),
    confirmedFindings: compact(v.findings),
    measurements: compact(v.measurements),
    limitations: compact(v.limitations),
    photoNotes: compact(photoNotes),
  };
  return { facts, message };
}

const INPUT_KEYS = ["peak_sun_hours", "system_losses", "panel_watts", "battery_voltage", "depth_of_discharge", "autonomy_days", "simultaneity"] as const;
const camel = (k: string) => k.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

/** Step 1. Returned in the app's field names but NOT yet checked: the caller runs shared `cleanSolarDesign`. */
export async function draftSolarPlan(input: z.input<typeof DraftReportInput>, options?: CallOptions) {
  const v = DraftReportInput.parse(input);
  const { message } = recordOf(v);
  const { data } = await chatJson(
    getAdapterConfig(),
    "draftDesign",
    { system: SYSTEM_GUARD + SOLAR_PLAN_PROMPT, user: JSON.stringify({ task: "draftSolarPlan", ...message }), schemaName: "solar_plan", schema: solarPlanSchema() },
    options,
  );
  const raw = data as Record<string, unknown>;
  const loads = arr(raw.loads).map((l) => ({ name: l.name, quantity: l.quantity, watts: l.watts, hoursPerDay: l.hours_per_day, source: l.source, motor: l.motor, note: l.note }));
  if (loads.length === 0) throw new AiAdapterError("The AI did not list any loads to size from", "invalid_response");
  const rawInputs = (raw.inputs && typeof raw.inputs === "object" ? raw.inputs : {}) as Record<string, unknown>;
  const inputs: Record<string, unknown> = { systemType: rawInputs.system_type };
  for (const k of INPUT_KEYS) inputs[camel(k)] = rawInputs[k];
  return { plan: { basis: arr(raw.basis), loads, inputs, placement: raw.placement }, requiresHumanReview: true as const };
}

/**
 * Step 2. `plan` is the checked plan (basis, loads, inputs, placement) and `sizing` the app's figures for it. Returns the prose and the remaining
 * sections, NOT yet checked: the caller merges them with the plan and runs `cleanSolarDesign`.
 */
export async function draftSolarWrite(input: z.input<typeof DraftReportInput>, plan: Record<string, unknown>, sizing: Record<string, unknown>, options?: CallOptions) {
  const v = DraftReportInput.parse(input);
  const { facts, message } = recordOf(v);
  const { data } = await chatJson(
    getAdapterConfig(),
    "draftDesign",
    { system: SYSTEM_GUARD + SOLAR_WRITE_PROMPT, user: JSON.stringify({ task: "draftSolarWrite", ...message, plan: compact(plan), sizing }), schemaName: "solar_write", schema: solarWriteSchema() },
    options,
  );
  const raw = data as Record<string, unknown>;
  const summary = capText(blank(raw.summary), REPORT_SECTION_MAX.summary);
  if (!summary) throw new AiAdapterError("The AI did not produce a summary", "invalid_response");
  const siteOverview = capText(blank(raw.site_overview), REPORT_SECTION_MAX.siteOverview);
  const rest = { options: arr(raw.options), equipment: arr(raw.equipment), installation: raw.installation, openItems: arr(raw.open_items), nextSteps: raw.next_steps };
  // The sizing's own figures are allowed in the prose (they are the app's, given to the model); a figure that is neither in the record nor in
  // the sizing needs a look.
  const unverifiedFigures = findUnverifiedFigures([summary, siteOverview].join("\n\n"), [facts, v.siteName, v.goal, plan, sizing]);
  return { summary, siteOverview, rest, missingInformation: list(raw.missing_information), assumptions: list(raw.assumptions), unverifiedFigures, requiresHumanReview: true as const };
}
