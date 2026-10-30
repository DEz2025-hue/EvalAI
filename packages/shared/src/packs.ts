export type PackId = "solar" | "cctv";
export type Mode = "assessment" | "inspection";

export type PackTemplate = {
  id: PackId;
  label: string;
  description: string;
  checklist: string[]; // titles — editable, not hard-coded compliance
};

// Deterministic templates — AI proposes edits, user confirms. Not compliance claims.
export const PACK_TEMPLATES: Record<PackId, PackTemplate> = {
  solar: {
    id: "solar",
    label: "Solar",
    description: "New / existing / upgrade / repair / mixed",
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
  },
  cctv: {
    id: "cctv",
    label: "CCTV",
    description: "New / existing / upgrade / repair / mixed",
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
  },
};

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
