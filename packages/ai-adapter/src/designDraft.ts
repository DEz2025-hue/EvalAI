import { z } from "zod";
import { getAdapterConfig } from "./config";
import { AiAdapterError } from "./client";
import { situationHint } from "./situation";
import { chatJson, type CallOptions } from "./chat";
import { designPlanSchema, designWriteSchema } from "./jsonSchemas";
import { DraftReportInput } from "./schemas";
import { SYSTEM_GUARD, compact } from "./text";
import { findUnverifiedFigures } from "./figures";
import { capText } from "./keyFindings";
import { REPORT_SECTION_MAX } from "./reportDraft";

// The design proposal (D-034). For a new CCTV installation the report is a design: the AI proposes where every camera goes and why,
// records the decisions it rests on and lists what must still be confirmed. A site FACT must come from the record; a design CHOICE is the
// AI's professional proposal and is labelled as one. Everything is a draft for a person to edit and sign off.
//
// Two calls, each inside one request's minute (a single call timed out on a real job): the PLAN (decisions, approach, cameras area by
// area) and then the WRITE-UP around that plan (summary, site description, options, equipment, installation, open items, next steps).

/** Rules both calls share. */
const DESIGN_RULES =
  "Two kinds of content, kept apart. SITE FACTS (what is there: buildings, floors, rooms, gates, distances, sizes, existing power or network) come ONLY from the record; never invent a room, a floor, a gate or a measurement. " +
  "DESIGN CHOICES (where each camera goes, which type, what it watches, recording and retention, monitoring, network and power approach) are a professional proposal: make them confidently, using good CCTV practice, as a designer would for the client to approve. " +
  "Rules: no prices or costs; no standards, codes or clause numbers; never say the design or the site complies with anything. Never use the words 'compliance', 'compliant' or 'complies'. Use site figures only as supplied. " +
  "siteBrief.interview holds what the person said: use it as the client's wishes and statements ('the client asked for', 'it was said that'), not as verified facts. " +
  "photoNotes are UNVERIFIED descriptions an AI wrote from the photos: use them to understand the site ('Photo 3 suggests a second gate on the left'); anything they suggest but the record does not confirm is an open item. " +
  "Write in plain, short, professional sentences in the third person, like a designer's report to a client.";

/** The camera plan: what the design rests on and where every camera goes. */
export const DESIGN_PLAN_PROMPT =
  " You are an experienced CCTV system designer planning a NEW installation from the saved record of the site visit: the site brief, what the person said in the interview, the intake description, checklist notes, measurements and descriptions of the photos. " +
  DESIGN_RULES +
  " basis: the decisions the design rests on, one row each: camera technology, recording mode, retention, audio, recorder location, monitoring points, power and backup, privacy areas, and anything else the record settles. basis = client when the client or person said it (interview, scope answers, goal), site when it comes from what was recorded on site, assumption when you chose it without being told. " +
  "approach: 3 to 7 short rules the placement follows (for example: every entrance, stair landing, hall and corridor is covered so a person can be followed through the building; the highest-risk rooms get a camera inside; ordinary offices get none). " +
  "areas: one area per floor, building, zone or the perimeter and gates, in a sensible walking order, using only areas that exist in the record. For each camera: id = a short unique code with an area prefix (G1, G2 for the ground floor, F1 for the first floor, X1 for the compound, and so on), numbered in order; location = exactly where it is mounted, by the room or space names in the record, with a corner or side when it matters ('Armory, north-west corner'); type from the list; purpose = what it watches in a few words. " +
  "If the record states how many cameras the client wants, plan exactly that many and put any further coverage you would recommend in the write-up's options, not in the plan. " +
  "Placement rules: cover every entrance and exit, stairs and landings, halls and corridors, and the route to sensitive rooms; put a camera inside high-risk rooms (server or equipment rooms, cash, stores of valuable or controlled goods, weapons, detention or custody) and two in a large or critical one so the whole room is seen; outdoors use outdoor-rated types; at a vehicle gate use a plate-reading camera for each direction vehicles pass; cover a fence line from its ends; use a PTZ only where an operator will actively track. Never put a camera inside toilets, changing or sleeping rooms, or rooms the record marks as private or sensitive for people (counselling, women and children, medical): list those in uncovered with the reason. Ordinary offices and staff rooms get no camera inside unless the record asks for it: list them in uncovered too. " +
  "uncovered: 'Room or space - reason', short. notes: two to four short remarks under the area's schedule (what the area's cameras achieve, anything left uncovered and why). " +
  "For each camera also give what it must achieve, for the app to check and size (D-037): detail = the level it must give at its target (identify for faces at entrances, tills and gates where people must be named; recognise for corridors and stairs where a known person must be told apart; observe for rooms, yards and car parks where activity must be seen; detect for long perimeter views); distance_m = metres from the camera to where that detail is needed (the door, the gate line, the far end of the corridor), from measurements or the record when given, otherwise your best estimate from the layout; megapixels = a sensible resolution (4 is common; 2 for plate cameras); fov_deg = the horizontal angle of view to set (about 90 to 100 for a short-lens dome, 30 to 60 for a camera that must identify at a distance, about 30 for a plate camera). Choose the angle so the camera can reach its detail at its distance. " +
  "system: the recording and power settings, each value with basis (client, site or assumption) and a short note: codec (h265 unless the record says otherwise), recording (continuous or motion, as the client asked, otherwise motion), fps (about 15 is common), motion_share (share of the day recorded on motion, often 0.2 to 0.5; busier sites higher), retention_days (as the client asked; otherwise 30 as an assumption), bitrate_per_mp (Mbps per megapixel at 15 fps on H.265; about 0.6 is a common planning value), drive_tb (8 is common), ups_minutes (how long the system should keep recording in a power cut; 30 as an assumption if not said). " +
  "Do NOT calculate storage, bandwidth, drives, PoE, recorder size or UPS: the app works them out from your cameras and settings.";

/** The write-up around a camera plan that is already settled. */
export const DESIGN_WRITE_PROMPT =
  " You are an experienced CCTV system designer finishing a design proposal for a NEW installation. The camera plan (basis, approach and cameras by area) is SETTLED: the person may have edited it. Do not change, re-count or re-argue it; write the rest of the proposal around it. " +
  DESIGN_RULES +
  " The app has already worked out the system from the plan (sizing): whether each camera gives its required detail, the bandwidth, storage and drives, the recorder, the PoE at each switch point and the UPS. Use those figures exactly when you mention them, never your own; if sizing.camerasShortOfDetail lists cameras, say in the summary that they need a closer position, a narrower lens or a higher resolution. " +
  "options: real coverage gaps the plan leaves that the client may choose to close, each with the number of extra cameras it would need. They are NOT in the main schedule. If the extra cameras would push the system past a sensible recorder size, say so in the option text. " +
  "equipment: everything except the cameras, the recorder, the drives, the PoE switches and the UPS (the app lists those from the sizing): core switch and network, cabinets and racks, cable and fibre, workstations and monitors, poles, brackets and mounts, signage. quantity: a count only when it follows from the plan itself (workstations, cabinets); for cable use 'to be sized after the survey' unless the record holds the figures to work it out, in which case write 'about N m' and say what it assumes in the specification. specification: the requirement, not a brand model, unless the client named a brand. " +
  "installation: the phases in order, one line each (survey, cabling and cabinets, outdoor works, cameras, recorder and software, testing and handover). " +
  "open_items: everything that must be confirmed before installation: unmeasured distances, cabinet positions, unnamed rooms, every basis row marked assumption, costs. status: 'Survey needed', 'To be confirmed', 'To be confirmed on site', 'Check after the first month' or 'To follow'. " +
  "next_steps: 3 to 6 concrete steps to turn this draft into a final design. " +
  "summary: 120 to 220 words for the client: who it is for and what the site is, the proposed system in plain words (camera kinds and where they go, where it records, where it is watched from), the key decisions, and what must be confirmed before installation. Do NOT state camera totals or counts per area: the report prints them from the plan next to the summary. " +
  "site_overview: one to three short paragraphs describing the site as recorded: the compound and gates, the buildings, floors and their layout, the rooms that matter for security. Do not repeat the summary. " +
  "missing_information: the few facts that would most improve the design. assumptions: the assumptions made, also listed in open_items.";

const blank = (s: unknown) => (typeof s === "string" ? s.trim() : "");
const list = (a: unknown) => (Array.isArray(a) ? a : []).map(blank).filter(Boolean).slice(0, 20);
const arr = (a: unknown): Array<Record<string, unknown>> => (Array.isArray(a) ? a.filter((x) => x && typeof x === "object") : []);

/** The record both calls read: the same facts the findings write-up gets, with photos numbered. */
function recordOf(v: z.output<typeof DraftReportInput>) {
  const photoNotes = v.photos.map((p, i) => ({ number: i + 1, itemTitle: p.itemTitle, caption: p.caption, observations: p.observations, possibleIssues: p.possibleIssues, cannotTell: p.cannotTell }));
  const facts = { siteBrief: v.siteBrief ?? {}, checklist: v.checklist, confirmedFindings: v.findings, measurements: v.measurements, limitations: v.limitations, materials: v.materials, photoNotes };
  const message = {
    siteName: v.siteName,
    mode: v.mode,
    pack: v.pack,
    situation: situationHint(v.scenario),
    goal: v.goal,
    siteBrief: compact(facts.siteBrief),
    checklist: compact(v.checklist),
    confirmedFindings: compact(v.findings),
    measurements: compact(v.measurements),
    limitations: compact(v.limitations),
    materials: compact(v.materials),
    photoNotes: compact(photoNotes),
  };
  return { facts, message };
}

/**
 * Step 1: the camera plan (basis, approach, areas with cameras). Returned in the app's field names but NOT yet checked: the caller runs
 * shared `cleanDesign` on it (the adapter does not depend on the shared package).
 */
export async function draftDesignPlan(input: z.input<typeof DraftReportInput>, options?: CallOptions) {
  const v = DraftReportInput.parse(input);
  const { message } = recordOf(v);
  const { data } = await chatJson(
    getAdapterConfig(),
    "draftDesign",
    { system: SYSTEM_GUARD + DESIGN_PLAN_PROMPT, user: JSON.stringify({ task: "draftDesignPlan", ...message }), schemaName: "design_plan", schema: designPlanSchema() },
    options,
  );
  const raw = data as Record<string, unknown>;
  const sys = (raw.system && typeof raw.system === "object" ? raw.system : null) as Record<string, unknown> | null;
  const areas = arr(raw.areas).map((a) => ({ ...a, cameras: arr(a.cameras).map((c) => ({ id: c.id, location: c.location, type: c.type, purpose: c.purpose, detail: c.detail, distanceM: c.distance_m, megapixels: c.megapixels, fovDeg: c.fov_deg })) }));
  const system = sys
    ? { codec: sys.codec, recording: sys.recording, fps: sys.fps, motionShare: sys.motion_share, retentionDays: sys.retention_days, bitratePerMp: sys.bitrate_per_mp, driveTb: sys.drive_tb, upsMinutes: sys.ups_minutes }
    : undefined;
  const plan = { basis: arr(raw.basis), approach: raw.approach, areas, ...(system ? { system } : {}) };
  if (!plan.areas.some((a) => arr(a.cameras).length > 0)) throw new AiAdapterError("The AI did not place any cameras", "invalid_response");
  return { plan, requiresHumanReview: true as const };
}

/**
 * Step 2: the write-up around a settled plan. `plan` is the checked plan (basis, approach, areas), as saved or edited. Returns the prose
 * and the remaining design sections, NOT yet checked: the caller merges them with the plan and runs `cleanDesign`.
 */
export async function draftDesignWrite(input: z.input<typeof DraftReportInput>, plan: { basis: unknown; approach: unknown; areas: unknown; system?: unknown }, sizing: Record<string, unknown> = {}, options?: CallOptions) {
  const v = DraftReportInput.parse(input);
  const { facts, message } = recordOf(v);
  const { data } = await chatJson(
    getAdapterConfig(),
    "draftDesign",
    { system: SYSTEM_GUARD + DESIGN_WRITE_PROMPT, user: JSON.stringify({ task: "draftDesignWrite", ...message, plan: compact(plan), sizing }), schemaName: "design_write", schema: designWriteSchema() },
    options,
  );
  const raw = data as Record<string, unknown>;
  const summary = capText(blank(raw.summary), REPORT_SECTION_MAX.summary);
  if (!summary) throw new AiAdapterError("The AI did not produce a summary", "invalid_response");
  const siteOverview = capText(blank(raw.site_overview), REPORT_SECTION_MAX.siteOverview);
  const rest = {
    options: arr(raw.options).map((o) => ({ area: o.area, gap: o.gap, option: o.option, extraCameras: o.extra_cameras })),
    equipment: arr(raw.equipment),
    installation: raw.installation,
    openItems: arr(raw.open_items),
    nextSteps: raw.next_steps,
  };
  // Only the summary and site description are prose about the site: a figure there that is not in the record needs a look. The design
  // itself is a proposal and its figures are the designer's, so they are not flagged.
  const unverifiedFigures = findUnverifiedFigures([summary, siteOverview].join("\n\n"), [facts, v.siteName, v.goal, plan, sizing]);
  return { summary, siteOverview, rest, missingInformation: list(raw.missing_information), assumptions: list(raw.assumptions), unverifiedFigures, requiresHumanReview: true as const };
}
