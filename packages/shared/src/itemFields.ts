// Simple answer fields on checklist items (D-042). Each template item asks a few plain questions with fixed choices or typed numbers, so the record holds facts
// the app and the AI can read without guessing from prose. A person fills them in; the AI may only suggest a choice marked aiCanSuggest, and a person confirms it.
// Numbers are always typed. Items someone adds or renames have no fields and keep notes only, as before.

export type ItemField =
  | {
      key: string;
      label: string;
      type: "choice";
      options: string[];
      /** Answers that mean something still needs dealing with. They make the item Needs attention, and Pass is refused. */
      concern?: string[];
      /** A photo or note can show this. "Verified"-style answers are never marked: only a person can say them. */
      aiCanSuggest?: boolean;
      /** Defaults to true. */
      required?: boolean;
    }
  | { key: string; label: string; type: "number"; unit: string; required?: boolean };

export type ItemFieldSet = { fields: ItemField[]; photoRequired?: boolean };

export type ItemAnswers = Record<string, string | number>;

/** An answer as a report shows it. A copy of the words, so a finalized report never changes when the definitions do. */
export type ReportAnswer = { label: string; value: string; concern?: boolean };

const choice = (key: string, label: string, options: string[], o: { concern?: string[]; ai?: boolean; optional?: boolean } = {}): ItemField => ({
  key,
  label,
  type: "choice",
  options,
  ...(o.concern ? { concern: o.concern } : {}),
  ...(o.ai ? { aiCanSuggest: true } : {}),
  ...(o.optional ? { required: false } : {}),
});
const num = (key: string, label: string, unit: string, optional = false): ItemField => ({ key, label, type: "number", unit, ...(optional ? { required: false } : {}) });

const YES_NO_UNKNOWN = ["Yes", "No", "Unknown"];
const CONDITION = ["Good", "Fair", "Poor", "Unknown"];
const POOR = ["Poor", "Unknown"];
const NOT_YES = ["No", "Unknown"];

const LIMITS: ItemFieldSet = { fields: [choice("couldNotCheck", "Anything you could not check?", ["No", "Yes"], { concern: ["Yes"] }), choice("followUp", "Follow-up visit needed?", ["No", "Yes", "Unknown"], { concern: ["Yes", "Unknown"] })] };
const RETENTION: ItemFieldSet = { fields: [num("days", "Recording kept for", "days"), choice("detail", "Detail needed", ["See activity", "Recognise a person", "Identify a person or plate", "Unknown"], { concern: ["Unknown"] })] };
const CCTV_CABLES: ItemFieldSet = { fields: [choice("route", "Cable route", ["Concealed", "Conduit or trunking", "Surface", "Not decided"], { concern: ["Not decided"], ai: true }), choice("access", "Route can be reached", YES_NO_UNKNOWN, { concern: NOT_YES })] };

/** The fields for each template title, in the same way LOOK_FOR gives its guidance. */
export const ITEM_FIELDS: Record<string, ItemFieldSet> = {
  // ---- Solar, shared by both situations ----
  "Site access, safety & isolation points": {
    fields: [choice("access", "Safe access to the work area", YES_NO_UNKNOWN, { concern: NOT_YES }), choice("isolation", "Main isolation point found", YES_NO_UNKNOWN, { concern: NOT_YES }), choice("hazards", "Hazards seen", ["None seen", "Yes, in the notes"], { concern: ["Yes, in the notes"] })],
    photoRequired: true,
  },
  "Roof / structure / mounting constraints": {
    fields: [
      choice("material", "Roof material", ["Corrugated metal", "Concrete", "Tile", "Other"], { ai: true }),
      choice("condition", "Roof condition", ["Good", "Fair", "Poor"], { concern: ["Poor"], ai: true }),
      num("length", "Roof length", "m"),
      num("width", "Roof width", "m"),
      num("pitch", "Roof pitch, if measured", "degrees", true),
      choice("structure", "Structural condition", ["Verified", "Not verified"], { concern: ["Not verified"] }),
      choice("mounting", "Mounting surface", ["Suitable", "Unsuitable", "Unknown"], { concern: ["Unsuitable", "Unknown"] }),
    ],
    photoRequired: true,
  },
  "Orientation, tilt, shading survey": {
    fields: [
      choice("facing", "Roof faces", ["North", "East", "South", "West", "Flat", "Unknown"], { concern: ["Unknown"] }),
      num("tilt", "Tilt, if measured", "degrees", true),
      choice("shade", "Shade on the roof", ["None seen", "Part of the day", "Most of the day", "Not checked"], { concern: ["Part of the day", "Most of the day", "Not checked"], ai: true }),
      choice("shadeChecked", "Shade checked through the day", ["Yes", "No"], { concern: ["No"] }),
    ],
    photoRequired: true,
  },
  "Load audit — demand & operating hours": {
    fields: [choice("listed", "All appliances listed", ["Yes", "No"], { concern: ["No"] }), choice("ratings", "Power ratings read from labels", ["All", "Some", "None"], { concern: ["Some", "None"] }), choice("hours", "Daily hours known", ["All", "Some", "None"], { concern: ["Some", "None"] }), choice("together", "Largest loads run together", YES_NO_UNKNOWN, { concern: ["Unknown"] })],
  },
  "Measurements — area, cable runs, distances": { fields: [num("area", "Usable area", "m²"), num("cable", "Longest cable run", "m"), choice("method", "How it was measured", ["Tape or laser", "App or photo estimate", "Not measured"], { concern: ["App or photo estimate", "Not measured"] })] },
  "Measurements — roof area, cable runs, distances": { fields: [num("area", "Usable roof area", "m²"), num("cable", "Longest cable run", "m"), choice("method", "How it was measured", ["Tape or laser", "App or photo estimate", "Not measured"], { concern: ["App or photo estimate", "Not measured"] })] },
  "Limitations & follow-up checks needed": LIMITS,
  // ---- Solar, existing system ----
  "Existing panels — count, rating, condition": { fields: [num("count", "Number of panels", "panels"), num("watts", "Rating of one panel", "W"), choice("condition", "Panel condition", CONDITION, { concern: POOR, ai: true })], photoRequired: true },
  "Inverter / charge controller — make, model, status": { fields: [choice("running", "Running normally", YES_NO_UNKNOWN, { concern: NOT_YES }), choice("faults", "Fault shown", ["None", "Yes", "Unknown"], { concern: ["Yes", "Unknown"], ai: true }), choice("label", "Label readable", ["Yes", "No"], { concern: ["No"], ai: true })], photoRequired: true },
  "Batteries — type, capacity, condition (if present)": { fields: [choice("type", "Battery type", ["Lithium", "Lead-acid", "Other", "Unknown"], { concern: ["Unknown"], ai: true }), num("capacity", "Capacity on the label", "Ah", true), choice("condition", "Battery condition", CONDITION, { concern: POOR, ai: true })], photoRequired: true },
  "Wiring, protection & earthing review": { fields: [choice("earthing", "Earthing", ["Installed", "Not installed", "Unknown"], { concern: ["Not installed", "Unknown"] }), choice("protection", "Isolators and breakers present", YES_NO_UNKNOWN, { concern: NOT_YES }), choice("cables", "Visible cable condition", CONDITION, { concern: POOR, ai: true })], photoRequired: true },
  // ---- Solar, new installation ----
  "Space for panels, inverter and batteries": {
    fields: [
      choice("location", "Equipment location", ["Indoors", "Outdoors, covered", "Outdoors, open", "Not decided"], { concern: ["Not decided"], ai: true }),
      choice("dry", "Dry", YES_NO_UNKNOWN, { concern: NOT_YES, ai: true }),
      choice("ventilated", "Ventilated", YES_NO_UNKNOWN, { concern: NOT_YES }),
      choice("clear", "Enough working room", YES_NO_UNKNOWN, { concern: NOT_YES, ai: true }),
    ],
    photoRequired: true,
  },
  "Electrical supply — main board, earthing, spare capacity": {
    fields: [
      choice("supply", "Supply", ["Single phase", "Three phase", "Unknown"], { concern: ["Unknown"] }),
      choice("earthing", "Earthing", ["Installed", "Not installed", "Unknown"], { concern: ["Not installed", "Unknown"] }),
      choice("board", "Main board condition", ["Good", "Fair", "Poor", "Unknown"], { concern: POOR, ai: true }),
      choice("cover", "Board cover fitted", ["Yes", "No", "Unknown"], { concern: NOT_YES, ai: true }),
      choice("spare", "Spare ways on the board", YES_NO_UNKNOWN, { concern: NOT_YES, ai: true }),
    ],
    photoRequired: true,
  },
  "Cable routes & distances (array, inverter, board)": { fields: [num("arrayToInverter", "Panels to inverter", "m"), num("inverterToBoard", "Inverter to board", "m"), choice("route", "Route", ["Concealed", "Conduit or trunking", "Surface", "Not decided"], { concern: ["Not decided"] })] },
  "Customer goals, budget & constraints": { fields: [choice("goal", "Main goal", ["Lower bills", "Backup power", "Off-grid", "Other"]), choice("budget", "Budget known", ["Yes", "No"], { concern: ["No"] }), choice("monitoring", "Wants remote monitoring", ["Yes", "No", "Unknown"], { concern: ["Unknown"], optional: true })] },
  "Permits, approvals & grid connection requirements": { fields: [choice("owner", "Owner or landlord approval", ["In writing", "Spoken only", "Not needed", "Unknown"], { concern: ["Spoken only", "Unknown"] }), choice("utility", "Utility or grid approval", ["Have it", "Needed", "Not needed", "Unknown"], { concern: ["Needed", "Unknown"] })] },
  // ---- CCTV, shared ----
  "Coverage goals & camera count": { fields: [num("cameras", "Cameras wanted", "cameras"), choice("areas", "Areas to cover agreed", ["Yes", "No"], { concern: ["No"] }), choice("purpose", "Main purpose", ["Deter", "Watch activity", "Identify people", "Other"])] },
  "Cabling routes & containment": CCTV_CABLES,
  "Retention & resolution requirements": RETENTION,
  "Measurements — cable lengths, distances": { fields: [num("cable", "Longest cable run", "m"), num("distance", "Furthest camera to recorder", "m"), choice("method", "How it was measured", ["Tape or laser", "App or photo estimate", "Not measured"], { concern: ["App or photo estimate", "Not measured"] })] },
  // ---- CCTV, existing system ----
  "Existing cameras — type, location, condition": { fields: [num("count", "Number of cameras", "cameras"), num("working", "Working now", "cameras"), choice("condition", "Camera condition", CONDITION, { concern: POOR, ai: true })], photoRequired: true },
  "Recorder / NVR & storage review": { fields: [choice("recording", "Recording now", YES_NO_UNKNOWN, { concern: NOT_YES }), num("days", "Days of recordings kept", "days", true), choice("condition", "Recorder condition", CONDITION, { concern: POOR, ai: true })], photoRequired: true },
  "Network & power survey": { fields: [choice("power", "Camera power", ["PoE", "Separate supply", "Mixed", "Unknown"], { concern: ["Unknown"] }), choice("backup", "Backup power", ["Yes", "No", "Unknown"], { concern: ["Unknown"] }), choice("faults", "Network or power faults", ["None", "Yes", "Unknown"], { concern: ["Yes", "Unknown"] })] },
  "Mounting positions & field of view": { fields: [choice("covers", "Views cover what they should", ["All", "Some", "None"], { concern: ["Some", "None"] }), choice("blocked", "Views blocked", ["None", "Some", "Unknown"], { concern: ["Some", "Unknown"], ai: true })], photoRequired: true },
  "Limitations & corrective actions": LIMITS,
  // ---- CCTV, new installation ----
  "Camera positions & field of view (per area)": { fields: [choice("marked", "Positions agreed", ["All", "Some", "None"], { concern: ["Some", "None"] }), choice("blocked", "Views blocked", ["None", "Some", "Unknown"], { concern: ["Some", "Unknown"], ai: true }), num("height", "Typical mounting height", "m", true)], photoRequired: true },
  "Lighting conditions (day and night)": { fields: [choice("day", "Daylight at the positions", ["Good", "Glare or backlight", "Poor", "Unknown"], { concern: ["Glare or backlight", "Poor", "Unknown"], ai: true }), choice("night", "Night light at the positions", ["Good", "Some", "Dark", "Not checked"], { concern: ["Dark", "Not checked"] })] },
  "Recorder location & storage requirements": { fields: [choice("secure", "Secure location", YES_NO_UNKNOWN, { concern: NOT_YES }), choice("ventilated", "Ventilated", YES_NO_UNKNOWN, { concern: NOT_YES, ai: true }), choice("power", "Power nearby", YES_NO_UNKNOWN, { concern: NOT_YES, ai: true })], photoRequired: true },
  "Network & power availability": { fields: [choice("power", "Power near the cameras", ["All", "Some", "None", "Unknown"], { concern: ["Some", "None", "Unknown"] }), choice("network", "Network near the recorder", YES_NO_UNKNOWN, { concern: NOT_YES })] },
  "Mounting surfaces & height access": { fields: [choice("surface", "Mounting surface", ["Suitable", "Unsuitable", "Unknown"], { concern: ["Unsuitable", "Unknown"], ai: true }), choice("access", "Height access", ["Ladder", "Lift or scaffold", "Unknown"], { concern: ["Unknown"] }), num("height", "Highest camera", "m", true)], photoRequired: true },
  "Privacy, signage & legal considerations": { fields: [choice("private", "Private areas in view", ["None", "Yes", "Unknown"], { concern: ["Yes", "Unknown"] }), choice("signs", "Signs planned", ["Yes", "No"], { concern: ["No"] })] },
};

export function fieldsFor(title: string): ItemFieldSet | undefined {
  return ITEM_FIELDS[title.trim()];
}

/** The choices an AI may suggest for an item, as a model is shown them. */
export function aiFieldsFor(title: string): Array<{ key: string; label: string; options: string[] }> {
  return (fieldsFor(title)?.fields ?? []).flatMap((f) => (f.type === "choice" && f.aiCanSuggest ? [{ key: f.key, label: f.label, options: f.options }] : []));
}

/** Keeps only answers to this item's fields: a listed choice, or a finite number that is not negative. */
export function cleanAnswers(title: string, raw: unknown): ItemAnswers {
  const out: ItemAnswers = {};
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (const f of fieldsFor(title)?.fields ?? []) {
    const v = r[f.key];
    if (f.type === "choice" && typeof v === "string" && f.options.includes(v)) out[f.key] = v;
    if (f.type === "number" && typeof v === "number" && Number.isFinite(v) && v >= 0) out[f.key] = v;
  }
  return out;
}

export function hasAnswers(title: string, raw: unknown): boolean {
  return Object.keys(cleanAnswers(title, raw)).length > 0;
}

/** The answers that mean something still needs dealing with. */
export function answerConcerns(title: string, raw: unknown): Array<{ label: string; value: string }> {
  const answers = cleanAnswers(title, raw);
  return (fieldsFor(title)?.fields ?? []).flatMap((f) => (f.type === "choice" && f.concern?.includes(String(answers[f.key])) ? [{ label: f.label, value: String(answers[f.key]) }] : []));
}

/** Required fields still blank. */
export function blankFields(title: string, raw: unknown): string[] {
  const answers = cleanAnswers(title, raw);
  return (fieldsFor(title)?.fields ?? []).filter((f) => f.required !== false && answers[f.key] === undefined).map((f) => f.label);
}

/** What the answers add up to: a concern needs attention, everything answered passes, anything else is not checked yet. */
export function statusFromAnswers(title: string, raw: unknown): "pass" | "needs_attention" | "not_checked" {
  if (answerConcerns(title, raw).length > 0) return "needs_attention";
  return hasAnswers(title, raw) && blankFields(title, raw).length === 0 ? "pass" : "not_checked";
}

/**
 * One field changed: the new answers and the status they lead to. Issue found and Not applicable are a person's own call, so they are kept.
 * `value` undefined clears the field.
 */
export function applyAnswer(title: string, status: string, raw: unknown, key: string, value: string | number | undefined): { answers: ItemAnswers; status: string } {
  const answers: ItemAnswers = { ...cleanAnswers(title, raw) };
  if (value === undefined) delete answers[key];
  else answers[key] = value;
  const clean = cleanAnswers(title, answers);
  return { answers: clean, status: status === "fail" || status === "not_applicable" ? status : statusFromAnswers(title, clean) };
}

/** The answers in the words a report prints. */
export function answerRows(title: string, raw: unknown): ReportAnswer[] {
  const answers = cleanAnswers(title, raw);
  return (fieldsFor(title)?.fields ?? []).flatMap((f): ReportAnswer[] => {
    const v = answers[f.key];
    if (v === undefined) return [];
    if (f.type === "number") return [{ label: f.label, value: `${v} ${f.unit}` }];
    return [{ label: f.label, value: String(v), ...(f.concern?.includes(String(v)) ? { concern: true } : {}) }];
  });
}

/** Typed numbers, for the report's measurements. */
export function answerMeasurements(title: string, raw: unknown): Array<{ name: string; value: number; unit: string }> {
  const answers = cleanAnswers(title, raw);
  return (fieldsFor(title)?.fields ?? []).flatMap((f) => (f.type === "number" && typeof answers[f.key] === "number" ? [{ name: f.label, value: answers[f.key] as number, unit: f.unit }] : []));
}

/** "Earthing: Not installed. Board cover fitted: No." for a report row's concerns, or an empty string. */
export function concernText(row: { answers?: ReportAnswer[] }): string {
  return (row.answers ?? []).filter((a) => a.concern).map((a) => `${a.label}: ${a.value}.`).join(" ");
}

/** A suggestion an AI made for one field. Nothing is saved until a person accepts it. */
export type FieldSuggestion = { key: string; label: string; value: string; quote?: string };
