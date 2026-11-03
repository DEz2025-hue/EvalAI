import type { Scenario } from "./scenario";

export type PackId = "solar" | "cctv";
export type Mode = "assessment" | "inspection";

export type PackTemplate = {
  id: PackId;
  label: string;
  description: string;
  /** Titles for a system that is already installed (also what jobs without a situation get). Editable, not hard-coded compliance. */
  checklist: string[];
  /** Titles for a new installation: a site survey, with nothing existing to inspect. */
  newInstallChecklist: string[];
};

// Deterministic templates — AI proposes edits, user confirms. Not compliance claims.
export const PACK_TEMPLATES: Record<PackId, PackTemplate> = {
  solar: {
    id: "solar",
    label: "Solar",
    description: "Site survey for a new installation, condition check for an existing system",
    checklist: [
      "Site access, safety & isolation points",
      "Existing panels — count, rating, condition",
      "Inverter / charge controller — make, model, status",
      "Batteries — type, capacity, condition (if present)",
      "Wiring, protection & earthing review",
      "Roof / structure / mounting constraints",
      "Orientation, tilt, shading survey",
      "Load audit — demand & operating hours",
      "Measurements — area, cable runs, distances",
      "Limitations & follow-up checks needed",
    ],
    newInstallChecklist: [
      "Site access, safety & isolation points",
      "Roof / structure / mounting constraints",
      "Space for panels, inverter and batteries",
      "Orientation, tilt, shading survey",
      "Load audit — demand & operating hours",
      "Electrical supply — main board, earthing, spare capacity",
      "Cable routes & distances (array, inverter, board)",
      "Customer goals, budget & constraints",
      "Permits, approvals & grid connection requirements",
      "Measurements — roof area, cable runs, distances",
      "Limitations & follow-up checks needed",
    ],
  },
  cctv: {
    id: "cctv",
    label: "CCTV",
    description: "Site survey for a new installation, condition check for an existing system",
    checklist: [
      "Coverage goals & camera count",
      "Existing cameras — type, location, condition",
      "Recorder / NVR & storage review",
      "Network & power survey",
      "Cabling routes & containment",
      "Mounting positions & field of view",
      "Retention & resolution requirements",
      "Measurements — cable lengths, distances",
      "Limitations & corrective actions",
    ],
    newInstallChecklist: [
      "Coverage goals & camera count",
      "Camera positions & field of view (per area)",
      "Lighting conditions (day and night)",
      "Recorder location & storage requirements",
      "Network & power availability",
      "Cabling routes & containment",
      "Mounting surfaces & height access",
      "Retention & resolution requirements",
      "Privacy, signage & legal considerations",
      "Measurements — cable lengths, distances",
      "Limitations & follow-up checks needed",
    ],
  },
};

/**
 * What to look for, per checklist item title (decision D-021). Plain guidance on what to observe and record: it never states
 * a requirement, a rating or a compliance result. Items the person adds themselves have none.
 */
export const LOOK_FOR: Record<string, string> = {
  // ---- Solar, shared by both situations ----
  "Site access, safety & isolation points": "Note how you get to the work area, the hazards on the way (height, wet or loose surfaces, live equipment) and where the main isolators are. Photograph the isolation points.",
  "Roof / structure / mounting constraints": "Look at the roof or mounting surface: material, pitch, visible condition, obstructions (vents, aerials, skylights) and how panels could be fixed. Photograph the whole surface and any damage.",
  "Orientation, tilt, shading survey": "Note which way the surface faces and its slope. Look for anything that casts shade through the day: trees, buildings, chimneys, neighbouring roofs. Photograph the horizon to the east, south and west.",
  "Load audit — demand & operating hours": "Ask what runs, how much and when: large appliances, pumps, air conditioning, night loads. Record what you are told and what you read off labels, and mark unknowns as unknown.",
  "Measurements — area, cable runs, distances": "Measure and record the roof or wall area, cable routes and distances you need, with units. Say how each was measured. Do not estimate by eye.",
  "Measurements — roof area, cable runs, distances": "Measure and record the usable roof area, cable routes and distances you need, with units. Say how each was measured. Do not estimate by eye.",
  "Limitations & follow-up checks needed": "Write down what you could not see, reach, test or confirm, and which checks a qualified person still has to do.",
  // ---- Solar, existing system ----
  "Existing panels — count, rating, condition": "Count the panels and read the rating label on one or more. Look for cracks, discolouration, hot-spot marks, dirt, loose frames or cables. Photograph labels and any damage.",
  "Inverter / charge controller — make, model, status": "Photograph the label (make, model, serial). Note any display message, fault light or alarm, how it is mounted, and whether it is protected from heat, water and dust.",
  "Batteries — type, capacity, condition (if present)": "If there are batteries, record the type and the label details. Look for swelling, leaks, corrosion, heat marks, poor ventilation and loose connections. Mark 'not present' if there are none.",
  "Wiring, protection & earthing review": "Look at visible cabling, isolators, breakers and earthing: damaged insulation, loose or burnt terminals, unlabelled or mixed-up cables, missing covers. Say what you could not see.",
  // ---- Solar, new installation ----
  "Space for panels, inverter and batteries": "Look for a dry, ventilated, reachable spot for the inverter and batteries, away from heat and water, with working room. Look for roof or ground space for the panels. Photograph each place.",
  "Electrical supply — main board, earthing, spare capacity": "Photograph the main board and its label. Note its condition, the supply type, spare breaker space and whether an earth connection is visible. Capacity is for a qualified person to confirm.",
  "Cable routes & distances (array, inverter, board)": "Walk the likely route from the panels to the inverter and to the main board. Note walls, ceilings or trenches to cross, obstacles and the approximate lengths. Photograph difficult points.",
  "Customer goals, budget & constraints": "Record what the customer wants (bills, backup, off-grid), any budget or timing limits, and anything they do not want done. Use their words.",
  "Permits, approvals & grid connection requirements": "Ask whether the building owner, landlord, utility or local authority has to approve the work and note what you were told. Do not assume the rules; record who to confirm with.",
  // ---- CCTV, shared ----
  "Coverage goals & camera count": "Ask what needs to be watched and why (entrances, cash points, perimeter, vehicles). Note the areas and how many cameras the customer expects. Record, do not decide.",
  "Cabling routes & containment": "Look at how cable could reach each camera: ceilings, walls, ducts, conduit or outdoor runs. Note obstacles and access problems. Photograph difficult points.",
  "Retention & resolution requirements": "Ask how many days of recordings are wanted and the detail required (reading a plate, recognising a face). Record the answer, including 'not known'.",
  "Measurements — cable lengths, distances": "Measure and record cable lengths and the distances from each camera to the area it must cover, with units. Say how each was measured.",
  // ---- CCTV, existing system ----
  "Existing cameras — type, location, condition": "List each camera: where it is, its type, whether it is powered and giving a picture. Look for dirt, spider webs, damage, wrong angle, loose mounts. Photograph each camera and its view if possible.",
  "Recorder / NVR & storage review": "Photograph the recorder label. Note whether it is on and recording, the days of video it holds, any error on screen, and where it is kept (ventilation, access, security).",
  "Network & power survey": "Note how cameras are powered and connected (network switch, power injector, separate power), visible faults, and anything unlabelled. Photograph the switch and power equipment.",
  "Mounting positions & field of view": "Stand at each camera or view its picture. Note what it actually covers, blind spots, glare, obstructions and whether the height and angle suit its job.",
  "Limitations & corrective actions": "Write down what you could not check and any fixes you think are needed. These are your notes for a qualified person to confirm.",
  // ---- CCTV, new installation ----
  "Camera positions & field of view (per area)": "For each area to cover, note a likely mounting place, what the camera would see, blind spots and glare. Photograph from where the camera would be.",
  "Lighting conditions (day and night)": "Note the light at the camera positions by day and at night: streetlights, security lights, dark corners, strong sun or headlights into the lens.",
  "Recorder location & storage requirements": "Look for a secure, ventilated, powered place for the recorder with network access. Note who can reach it. Record how long recordings are to be kept.",
  "Network & power availability": "Note where power and network are available near the camera positions and where they are not. Photograph switches, sockets and distribution boards.",
  "Mounting surfaces & height access": "Note what each camera would be fixed to (wall, pole, soffit), its condition, the height and how you would reach it safely.",
  "Privacy, signage & legal considerations": "Note areas that should not be recorded (neighbours, toilets, public space) and where signs would be needed. Record what the customer says; rules are for them to confirm.",
};

export type TemplateItemMeta = { required: boolean; category: string };

/**
 * Required flag and group for each template item. A required item can't be left Not Checked when the job is finished;
 * Not Applicable with a reason is allowed. Only items that may simply not exist on a site are optional.
 */
export const TEMPLATE_ITEM: Record<string, TemplateItemMeta> = {
  // ---- Solar ----
  "Site access, safety & isolation points": { required: true, category: "Site" },
  "Existing panels — count, rating, condition": { required: true, category: "System" },
  "Inverter / charge controller — make, model, status": { required: true, category: "System" },
  "Batteries — type, capacity, condition (if present)": { required: false, category: "System" },
  "Wiring, protection & earthing review": { required: true, category: "Electrical" },
  "Roof / structure / mounting constraints": { required: true, category: "Site" },
  "Orientation, tilt, shading survey": { required: true, category: "Site" },
  "Load audit — demand & operating hours": { required: true, category: "Customer" },
  "Measurements — area, cable runs, distances": { required: true, category: "Measurements" },
  "Limitations & follow-up checks needed": { required: true, category: "Report" },
  "Space for panels, inverter and batteries": { required: true, category: "Site" },
  "Electrical supply — main board, earthing, spare capacity": { required: true, category: "Electrical" },
  "Cable routes & distances (array, inverter, board)": { required: true, category: "Site" },
  "Customer goals, budget & constraints": { required: true, category: "Customer" },
  "Permits, approvals & grid connection requirements": { required: true, category: "Customer" },
  "Measurements — roof area, cable runs, distances": { required: true, category: "Measurements" },
  // ---- CCTV ----
  "Coverage goals & camera count": { required: true, category: "Customer" },
  "Existing cameras — type, location, condition": { required: true, category: "System" },
  "Recorder / NVR & storage review": { required: true, category: "System" },
  "Network & power survey": { required: true, category: "System" },
  "Cabling routes & containment": { required: true, category: "Site" },
  "Mounting positions & field of view": { required: true, category: "Site" },
  "Retention & resolution requirements": { required: true, category: "Customer" },
  "Measurements — cable lengths, distances": { required: true, category: "Measurements" },
  "Limitations & corrective actions": { required: true, category: "Report" },
  "Camera positions & field of view (per area)": { required: true, category: "Site" },
  "Lighting conditions (day and night)": { required: true, category: "Site" },
  "Recorder location & storage requirements": { required: true, category: "Site" },
  "Network & power availability": { required: true, category: "Site" },
  "Mounting surfaces & height access": { required: true, category: "Site" },
  "Privacy, signage & legal considerations": { required: true, category: "Customer" },
};

/** Required flag and group for a template title. Titles not in a template (typed in, renamed) are optional and ungrouped. */
export function templateItemMeta(title: string): TemplateItemMeta | undefined {
  return TEMPLATE_ITEM[title.trim()];
}

/** The guidance for a checklist item title, or undefined for items someone typed in themselves. */
export function lookForFor(title: string): string | undefined {
  return LOOK_FOR[title.trim()];
}

/** The checklist a new job starts with. No situation (older jobs) gets the existing-system list, as before. */
export function checklistFor(pack: PackId, scenario: Scenario | null | undefined): string[] {
  const t = getPack(pack);
  return scenario === "new_install" ? t.newInstallChecklist : t.checklist;
}

export function getPack(pack: PackId): PackTemplate {
  const t = PACK_TEMPLATES[pack];
  if (!t) throw new Error(`Unknown pack: ${pack}`);
  return t;
}

/** Domain terms that bias speech recognition toward the right spelling (a hint, not a guarantee). */
export const PACK_KEYWORDS: Record<PackId, string[]> = {
  solar: ["inverter", "MPPT", "string", "PV array", "DC isolator", "AC isolator", "combiner box", "MC4", "earthing", "charge controller", "battery bank", "kWp", "kWh", "Voc", "Isc", "tilt", "azimuth", "shading", "roof pitch", "mounting rail"],
  cctv: ["NVR", "DVR", "PoE", "IP camera", "PTZ", "dome camera", "bullet camera", "RTSP", "ONVIF", "field of view", "IR illuminator", "Cat6", "coax", "VMS", "H.265", "bitrate", "retention", "lux", "switch", "patch panel"],
};

export function keywordsFor(pack: PackId | undefined): string[] {
  return pack ? PACK_KEYWORDS[pack] : [...PACK_KEYWORDS.solar, ...PACK_KEYWORDS.cctv];
}
