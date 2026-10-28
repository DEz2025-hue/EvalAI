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
