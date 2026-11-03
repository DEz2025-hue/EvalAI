// Design proposal (decision D-034). A new CCTV installation needs a design, not a list of pass/fail findings: which cameras go where and
// why, what was decided with the client, what is still to be confirmed. The AI drafts it from the record and a person edits and signs
// it off. Camera counts are always counted here from the camera schedule, never written by the AI, so the totals cannot disagree.

export const CAMERA_TYPES = ["indoor_dome", "outdoor_dome", "turret", "outdoor_bullet", "ptz", "lpr", "fisheye", "other"] as const;
export type CameraType = (typeof CAMERA_TYPES)[number];

export const CAMERA_TYPE_LABEL: Record<CameraType, string> = {
  indoor_dome: "Indoor dome",
  outdoor_dome: "Outdoor dome",
  turret: "Turret",
  outdoor_bullet: "Outdoor bullet",
  ptz: "PTZ camera",
  lpr: "Licence plate (LPR) camera",
  fisheye: "Fisheye (360°)",
  other: "Other camera",
};

/** How much detail a camera must give at its target (D-037): the DORI levels of EN 62676-4. */
export const DORI_LEVELS = ["detect", "observe", "recognise", "identify"] as const;
export type DoriLevel = (typeof DORI_LEVELS)[number];
export const DORI_LABEL: Record<DoriLevel, string> = { detect: "Detect", observe: "Observe", recognise: "Recognise", identify: "Identify" };

/**
 * One camera in the schedule: its ID on the plan, where it goes, what kind it is and what it watches. The spec fields (D-037) feed the system
 * sizing; they are optional so designs saved before sizing existed still load, and the sizing fills any gap with a planning default.
 */
export type DesignCamera = {
  id: string;
  location: string;
  type: CameraType;
  purpose: string;
  /** Detail the camera must give at its target. */
  detail?: DoriLevel;
  /** Distance from the camera to the target it must see at that detail, in metres. */
  distanceM?: number;
  /** Image resolution in megapixels. */
  megapixels?: number;
  /** Horizontal angle of view in degrees, as set on site. */
  fovDeg?: number;
};

/** A system setting with where it came from (client, site or assumption) and a short note. */
export type SystemValue = { value: number; basis: DecisionBasis; note: string };

/** The recording and power settings the sizing rests on (D-037). */
export type CctvSystem = {
  codec: "h264" | "h265";
  recording: "continuous" | "motion";
  fps: SystemValue;
  /** Share of the day a camera records when recording on motion (0.05 to 1). */
  motionShare: SystemValue;
  retentionDays: SystemValue;
  /** Planning bitrate, Mbps per megapixel at 15 fps on H.265. */
  bitratePerMp: SystemValue;
  /** Size of one surveillance drive, TB. */
  driveTb: SystemValue;
  /** How long the UPS must keep the system running, minutes. */
  upsMinutes: SystemValue;
};

/** A floor, building or zone of the site, with its cameras and the places in it that deliberately get no camera. */
export type DesignArea = {
  name: string;
  cameras: DesignCamera[];
  /** Rooms or spaces left without a camera, each with the reason ("Women and children - privacy"). */
  uncovered: string[];
  /** Short notes under the area's schedule. */
  notes: string[];
};

/** Where a design decision came from: the client said it, it was seen on site, or it is an assumption to confirm. */
export const DECISION_BASES = ["client", "site", "assumption"] as const;
export type DecisionBasis = (typeof DECISION_BASES)[number];
export const DECISION_BASIS_LABEL: Record<DecisionBasis, string> = { client: "Client", site: "Site", assumption: "Assumption" };

export type DesignDecision = { item: string; decision: string; basis: DecisionBasis };
/** A gap in coverage the client may choose to close. Not part of the camera count. */
export type DesignOption = { area: string; gap: string; option: string; extraCameras: number };
/** Equipment other than cameras (cameras are counted from the schedule). Quantity is text so "about 2,200 m" or "as needed" fit. */
export type DesignEquipment = { item: string; quantity: string; specification: string };
export type DesignOpenItem = { item: string; status: string };

export type DesignProposal = {
  /** The design basis: the decisions the design rests on (recording, retention, audio, monitoring, power, …). */
  basis: DesignDecision[];
  /** The design approach, as short rules ("every entrance and stair landing is covered"). */
  approach: string[];
  areas: DesignArea[];
  options: DesignOption[];
  equipment: DesignEquipment[];
  installation: string[];
  openItems: DesignOpenItem[];
  nextSteps: string[];
  /** Recording and power settings for the system sizing (D-037). Absent on designs saved before sizing existed. */
  system?: CctvSystem;
};

/** Limits shared by the AI parser, the save route and the editors. */
export const DESIGN_LIMITS = {
  basis: 30,
  approach: 15,
  areas: 20,
  camerasPerArea: 60,
  cameras: 250,
  uncovered: 30,
  notes: 10,
  options: 20,
  equipment: 40,
  installation: 15,
  openItems: 30,
  nextSteps: 15,
  short: 160,
  text: 600,
  id: 12,
} as const;

const L = DESIGN_LIMITS;
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const lines = (v: unknown, maxItems: number, max: number = L.text): string[] => (Array.isArray(v) ? v.map((x) => text(x, max)).filter(Boolean).slice(0, maxItems) : []);
const rows = <T>(v: unknown, maxItems: number, one: (r: Record<string, unknown>) => T | null): T[] =>
  (Array.isArray(v) ? v : [])
    .map((r) => (r && typeof r === "object" ? one(r as Record<string, unknown>) : null))
    .filter((r): r is T => r !== null)
    .slice(0, maxItems);

/** A number from a number or from text like "3.5 m"; NaN when there is no digit at all, so the caller falls back to its default. */
export const toNum = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v !== "string" || !/\d/.test(v)) return NaN;
  return Number(v.replace(/[^\d.-]/g, ""));
};

/** Allowed range and planning default of each system setting. Defaults are common planning values and are marked as assumptions. */
export const SYSTEM_RANGES: Record<Exclude<keyof CctvSystem, "codec" | "recording">, { min: number; max: number; default: number; unit: string; label: string }> = {
  fps: { min: 1, max: 60, default: 15, unit: "fps", label: "Frame rate" },
  motionShare: { min: 0.05, max: 1, default: 0.35, unit: "", label: "Share of the day recorded (motion)" },
  retentionDays: { min: 1, max: 365, default: 30, unit: "days", label: "Retention" },
  bitratePerMp: { min: 0.1, max: 5, default: 0.6, unit: "Mbps per MP", label: "Bitrate per megapixel (15 fps, H.265)" },
  driveTb: { min: 1, max: 30, default: 8, unit: "TB", label: "Drive size" },
  upsMinutes: { min: 0, max: 480, default: 30, unit: "min", label: "UPS runtime" },
};

function cleanSystem(raw: Record<string, unknown>): CctvSystem {
  const value = (key: keyof typeof SYSTEM_RANGES): SystemValue => {
    const r = SYSTEM_RANGES[key];
    const o = raw[key] && typeof raw[key] === "object" ? (raw[key] as Record<string, unknown>) : { value: raw[key] };
    const n = toNum(o.value);
    if (!Number.isFinite(n)) return { value: r.default, basis: "assumption", note: "Planning default" };
    return { value: Math.round(Math.min(r.max, Math.max(r.min, n)) * 1000) / 1000, basis: (DECISION_BASES as readonly string[]).includes(String(o.basis)) ? (o.basis as DecisionBasis) : "assumption", note: text(o.note, L.short) };
  };
  return {
    codec: raw.codec === "h264" ? "h264" : "h265",
    recording: raw.recording === "continuous" ? "continuous" : "motion",
    fps: value("fps"),
    motionShare: value("motionShare"),
    retentionDays: value("retentionDays"),
    bitratePerMp: value("bitratePerMp"),
    driveTb: value("driveTb"),
    upsMinutes: value("upsMinutes"),
  };
}

/** The camera type for free text the AI or an editor sent ("Indoor dome", "lpr", "bullet"). */
export function cameraTypeOf(v: unknown): CameraType {
  const s = String(v ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if ((CAMERA_TYPES as readonly string[]).includes(s)) return s as CameraType;
  if (/lpr|anpr|plate/.test(s)) return "lpr";
  if (/ptz/.test(s)) return "ptz";
  if (/fish|360/.test(s)) return "fisheye";
  if (/turret|eyeball/.test(s)) return "turret";
  if (/bullet/.test(s)) return "outdoor_bullet";
  if (/dome/.test(s)) return /out|ext/.test(s) ? "outdoor_dome" : "indoor_dome";
  return "other";
}

/**
 * Checks and tidies a design that came from the AI or an editor (untrusted): every text is trimmed and capped, rows with no content
 * are dropped, camera types are mapped to the known list and camera IDs are made unique across the whole design. Never throws on
 * content; returns null when there is no design at all.
 */
export function cleanDesign(raw: unknown): DesignProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const ids = new Set<string>();
  let total = 0;
  const areas = rows(d.areas, L.areas, (a) => {
    const name = text(a.name, L.short);
    if (!name) return null;
    const cameras = rows(a.cameras, L.camerasPerArea, (c) => {
      const location = text(c.location, L.short);
      if (!location || total >= L.cameras) return null;
      let id = text(c.id, L.id).toUpperCase() || "C" + (total + 1);
      while (ids.has(id)) id = id.slice(0, L.id - 1) + "'";
      ids.add(id);
      total++;
      const spec: Partial<DesignCamera> = {};
      if ((DORI_LEVELS as readonly string[]).includes(String(c.detail))) spec.detail = c.detail as DoriLevel;
      const dist = toNum(c.distanceM);
      if (Number.isFinite(dist) && dist > 0) spec.distanceM = Math.round(Math.min(dist, 500) * 10) / 10;
      const mp = toNum(c.megapixels);
      if (Number.isFinite(mp) && mp > 0) spec.megapixels = Math.round(Math.min(Math.max(mp, 0.3), 33) * 10) / 10;
      const fov = toNum(c.fovDeg);
      if (Number.isFinite(fov) && fov > 0) spec.fovDeg = Math.round(Math.min(Math.max(fov, 2), 360));
      return { id, location, type: cameraTypeOf(c.type), purpose: text(c.purpose, L.short), ...spec };
    });
    return { name, cameras, uncovered: lines(a.uncovered, L.uncovered, L.short), notes: lines(a.notes, L.notes) };
  });
  const design: DesignProposal = {
    basis: rows(d.basis, L.basis, (b) => {
      const item = text(b.item, L.short);
      const decision = text(b.decision, L.text);
      if (!item || !decision) return null;
      return { item, decision, basis: (DECISION_BASES as readonly string[]).includes(String(b.basis)) ? (b.basis as DecisionBasis) : "assumption" };
    }),
    approach: lines(d.approach, L.approach),
    areas,
    options: rows(d.options, L.options, (o) => {
      const gap = text(o.gap, L.text);
      if (!gap) return null;
      const n = Math.round(Number(o.extraCameras));
      return { area: text(o.area, L.short), gap, option: text(o.option, L.short), extraCameras: Number.isFinite(n) && n > 0 ? Math.min(n, 99) : 0 };
    }),
    equipment: rows(d.equipment, L.equipment, (e) => {
      const item = text(e.item, L.short);
      return item ? { item, quantity: text(e.quantity, 40), specification: text(e.specification, L.text) } : null;
    }),
    installation: lines(d.installation, L.installation),
    openItems: rows(d.openItems, L.openItems, (o) => {
      const item = text(o.item, L.text);
      return item ? { item, status: text(o.status, 60) || "To be confirmed" } : null;
    }),
    nextSteps: lines(d.nextSteps, L.nextSteps),
    ...(d.system && typeof d.system === "object" ? { system: cleanSystem(d.system as Record<string, unknown>) } : {}),
  };
  return hasDesign(design) ? design : null;
}

/** A design worth showing: at least one camera, or at least a design basis. */
export function hasDesign(d: DesignProposal | null | undefined): d is DesignProposal {
  return !!d && (d.areas.some((a) => a.cameras.length > 0) || d.basis.length > 0);
}

export type DesignCounts = {
  total: number;
  byArea: Array<{ name: string; count: number }>;
  /** Camera types in schedule order, with the areas each type is used in. */
  byType: Array<{ type: CameraType; label: string; count: number; where: string[] }>;
  /** Cameras the coverage options would add. */
  optionalExtra: number;
};

/** Counts every camera in the schedule. The report's totals and type table come from here, never from the AI's prose. */
export function designCounts(d: DesignProposal): DesignCounts {
  const types = new Map<CameraType, { count: number; where: string[] }>();
  for (const a of d.areas) {
    for (const c of a.cameras) {
      const t = types.get(c.type) ?? { count: 0, where: [] };
      t.count++;
      if (!t.where.includes(a.name)) t.where.push(a.name);
      types.set(c.type, t);
    }
  }
  return {
    total: d.areas.reduce((n, a) => n + a.cameras.length, 0),
    byArea: d.areas.map((a) => ({ name: a.name, count: a.cameras.length })),
    byType: CAMERA_TYPES.filter((t) => types.has(t)).map((t) => ({ type: t, label: CAMERA_TYPE_LABEL[t], ...types.get(t)! })),
    optionalExtra: d.options.reduce((n, o) => n + o.extraCameras, 0),
  };
}

/** Jobs that get a design proposal instead of a findings report: a CCTV job where nothing is installed yet. */
export function isDesignJob(pack: string, scenario: string | null | undefined): boolean {
  return pack === "cctv" && scenario === "new_install";
}
