import { CAMERA_TYPE_LABEL, DORI_LABEL, SYSTEM_RANGES, type CameraType, type CctvSystem, type DesignCamera, type DesignEquipment, type DesignProposal, type DoriLevel } from "./design";
import type { SizingStep } from "./solarDesign";

// CCTV system sizing (decision D-037). The AI drafts what each camera must achieve and the recording settings; everything below is worked out
// here, in code, and printed with its formulas: whether each camera gives the detail it needs at its distance (DORI pixel density), the
// bandwidth, the storage and drives, the PoE load at each switch point, the recorder and the UPS. Missing inputs use planning defaults that
// are shown as assumptions.

/** Pixels per metre on the target for each detail level (EN 62676-4, as published in the Axis DORI guidance). */
export const DORI_PX_PER_M: Record<DoriLevel, number> = { detect: 25, observe: 62.5, recognise: 125, identify: 250 };

/** Planning defaults per camera type when the design does not say: resolution, angle of view, maximum PoE draw (with IR and heater on). */
export const CAMERA_DEFAULTS: Record<CameraType, { megapixels: number; fovDeg: number; poeW: number; poeClass: string }> = {
  indoor_dome: { megapixels: 4, fovDeg: 90, poeW: 7, poeClass: "802.3af" },
  turret: { megapixels: 4, fovDeg: 90, poeW: 8, poeClass: "802.3af" },
  outdoor_dome: { megapixels: 4, fovDeg: 85, poeW: 10, poeClass: "802.3af" },
  outdoor_bullet: { megapixels: 4, fovDeg: 80, poeW: 10, poeClass: "802.3af" },
  fisheye: { megapixels: 12, fovDeg: 180, poeW: 10, poeClass: "802.3af" },
  lpr: { megapixels: 2, fovDeg: 30, poeW: 15, poeClass: "802.3at" },
  ptz: { megapixels: 4, fovDeg: 60, poeW: 30, poeClass: "802.3at" },
  other: { megapixels: 4, fovDeg: 85, poeW: 10, poeClass: "802.3af" },
};

/** Default target distance per detail level when the design does not give one, metres. */
const DEFAULT_DISTANCE: Record<DoriLevel, number> = { detect: 25, observe: 15, recognise: 8, identify: 4 };
/** H.264 needs this much more bitrate than H.265 for the same picture (sources quote a 30 to 50% saving for H.265). */
export const H264_FACTOR = 1.6;
/** Extra storage on top of the calculated need. */
export const STORAGE_HEADROOM = 0.15;
/** Highest share of a switch's PoE budget to plan to use. */
export const POE_MAX_LOAD = 0.8;
/** Recorder power, watts, plus per drive. */
const RECORDER_W = 40;
const DRIVE_W = 8;
/** Switch electronics on top of the PoE it delivers. */
const SWITCH_OVERHEAD = 1.1;
const UPS_POWER_FACTOR = 0.7;
const UPS_EFFICIENCY = 0.9;

const SWITCH_PORTS = [4, 8, 16, 24, 48];
const SWITCH_BUDGETS_W = [65, 120, 250, 370, 740];

/** Horizontal pixels for a resolution in megapixels (common sensor sizes; otherwise a 16:9 estimate). */
export function horizontalPixels(mp: number): number {
  const known: Record<number, number> = { 1: 1280, 2: 1920, 3: 2304, 4: 2560, 5: 2592, 6: 3072, 8: 3840, 12: 4000 };
  return known[Math.round(mp)] && Math.abs(mp - Math.round(mp)) < 0.05 ? known[Math.round(mp)] : Math.round(Math.sqrt((mp * 1e6 * 16) / 9));
}

const rad = (deg: number) => (deg * Math.PI) / 180;
/** Width of the scene at a distance, metres: 2 x distance x tan(angle / 2). */
export const sceneWidth = (distanceM: number, fovDeg: number) => 2 * distanceM * Math.tan(rad(Math.min(fovDeg, 170)) / 2);

export type CameraCheck = {
  id: string;
  area: string;
  location: string;
  type: CameraType;
  detail: DoriLevel;
  distanceM: number;
  megapixels: number;
  fovDeg: number;
  pxPerM: number;
  /** The best level the camera reaches at its distance, or null if it does not even detect. */
  achieved: DoriLevel | null;
  meets: boolean;
  /** Furthest distance at which it still gives the required detail, metres. */
  maxDistanceM: number;
  /** Narrowest angle of view that would give the required detail at the distance, degrees (when it does not meet it). */
  neededFovDeg: number;
  bitrateMbps: number;
  poeW: number;
  /** Which spec values were planning defaults rather than the design's own. */
  assumed: string[];
};

export type SwitchPoint = { area: string; cameras: number; poeW: number; ports: number; budgetW: number; needsAt: boolean };

export type CctvSizing = {
  system: CctvSystem;
  cameras: CameraCheck[];
  totalCameras: number;
  failing: CameraCheck[];
  bandwidthMbps: number;
  dailyGb: number;
  storageTb: number;
  storageWithHeadroomTb: number;
  drives: number;
  recorderChannels: number;
  switches: SwitchPoint[];
  poeTotalW: number;
  upsLoadW: number;
  upsVa: number;
  upsWh: number;
  steps: SizingStep[];
};

/** The design's system settings, or planning defaults marked as assumptions. */
export function systemOf(d: DesignProposal): CctvSystem {
  if (d.system) return d.system;
  const v = (k: keyof typeof SYSTEM_RANGES) => ({ value: SYSTEM_RANGES[k].default, basis: "assumption" as const, note: "Planning default" });
  return { codec: "h265", recording: "motion", fps: v("fps"), motionShare: v("motionShare"), retentionDays: v("retentionDays"), bitratePerMp: v("bitratePerMp"), driveTb: v("driveTb"), upsMinutes: v("upsMinutes") };
}

const LEVELS_HIGH_FIRST: DoriLevel[] = ["identify", "recognise", "observe", "detect"];
const roundUpTo = (v: number, list: number[]) => list.find((x) => x >= v) ?? list[list.length - 1];
const r1 = (n: number) => Math.round(n * 10) / 10;

function checkCamera(c: DesignCamera, area: string, s: CctvSystem): CameraCheck {
  const def = CAMERA_DEFAULTS[c.type];
  const assumed: string[] = [];
  const detail: DoriLevel = c.detail ?? (c.type === "lpr" ? "identify" : "observe");
  if (!c.detail) assumed.push("detail");
  const distanceM = c.distanceM ?? DEFAULT_DISTANCE[detail];
  if (!c.distanceM) assumed.push("distance");
  const megapixels = c.megapixels ?? def.megapixels;
  if (!c.megapixels) assumed.push("resolution");
  const fovDeg = c.fovDeg ?? def.fovDeg;
  if (!c.fovDeg) assumed.push("angle of view");
  const hpx = horizontalPixels(megapixels);
  const pxPerM = hpx / sceneWidth(distanceM, fovDeg);
  const achieved = LEVELS_HIGH_FIRST.find((l) => pxPerM >= DORI_PX_PER_M[l]) ?? null;
  const need = DORI_PX_PER_M[detail];
  const meets = pxPerM >= need;
  const maxDistanceM = hpx / (need * 2 * Math.tan(rad(Math.min(fovDeg, 170)) / 2));
  const neededFovDeg = (2 * Math.atan(hpx / (need * 2 * distanceM)) * 180) / Math.PI;
  const codec = s.codec === "h264" ? H264_FACTOR : 1;
  const bitrateMbps = megapixels * s.bitratePerMp.value * (s.fps.value / 15) * codec;
  return { id: c.id, area, location: c.location, type: c.type, detail, distanceM, megapixels, fovDeg, pxPerM, achieved, meets, maxDistanceM, neededFovDeg, bitrateMbps, poeW: def.poeW, assumed };
}

/** Works out the whole system from the camera plan and the settings. Deterministic; the only source of every size in the CCTV system design. */
export function cctvSizing(d: DesignProposal): CctvSizing {
  const s = systemOf(d);
  const cameras = d.areas.flatMap((a) => a.cameras.map((c) => checkCamera(c, a.name, s)));
  const total = cameras.length;
  const bandwidthMbps = cameras.reduce((n, c) => n + c.bitrateMbps, 0);
  const recordShare = s.recording === "continuous" ? 1 : s.motionShare.value;
  // Mbps x 86,400 s / 8 bits = MB a day; / 1000 = GB.
  const dailyGb = (bandwidthMbps * 86_400) / 8 / 1000 * recordShare;
  const storageTb = (dailyGb * s.retentionDays.value) / 1000;
  const storageWithHeadroomTb = storageTb * (1 + STORAGE_HEADROOM);
  const drives = Math.max(1, Math.ceil(storageWithHeadroomTb / s.driveTb.value));
  const recorderChannels = roundUpTo(Math.ceil(total * 1.25), [4, 8, 16, 32, 64, 128, 256]);
  const switches: SwitchPoint[] = d.areas
    .filter((a) => a.cameras.length > 0)
    .map((a) => {
      const own = cameras.filter((c) => c.area === a.name);
      const poeW = own.reduce((n, c) => n + c.poeW, 0);
      return { area: a.name, cameras: own.length, poeW, ports: roundUpTo(Math.ceil(own.length * 1.2), SWITCH_PORTS), budgetW: roundUpTo(poeW / POE_MAX_LOAD, SWITCH_BUDGETS_W), needsAt: own.some((c) => c.poeW > 15.4) };
    });
  const poeTotalW = switches.reduce((n, w) => n + w.poeW, 0);
  const upsLoadW = poeTotalW * SWITCH_OVERHEAD + RECORDER_W + drives * DRIVE_W;
  const upsVa = Math.ceil(upsLoadW / UPS_POWER_FACTOR / 100) * 100;
  const upsWh = (upsLoadW * s.upsMinutes.value) / 60 / UPS_EFFICIENCY;
  const failing = cameras.filter((c) => !c.meets);
  const steps: SizingStep[] = [
    { label: "Cameras giving the detail they need", formula: "Pixels per metre on the target = horizontal pixels / (2 x distance x tan(angle / 2)), against Detect 25, Observe 62.5, Recognise 125, Identify 250 px/m", value: total - failing.length, unit: `of ${total}` },
    { label: "Total bitrate", formula: `Sum over cameras of megapixels x ${s.bitratePerMp.value} Mbps x (${s.fps.value} fps / 15)${s.codec === "h264" ? ` x ${H264_FACTOR} for H.264` : " (H.265)"}`, value: r1(bandwidthMbps), unit: "Mbps" },
    { label: "Recorded per day", formula: `Bitrate x 86,400 s / 8 / 1000${s.recording === "motion" ? ` x ${s.motionShare.value} share of the day on motion` : " (continuous)"}`, value: r1(dailyGb), unit: "GB" },
    { label: "Storage for retention", formula: `Per day x ${s.retentionDays.value} days / 1000`, value: r1(storageTb), unit: "TB" },
    { label: "Storage with headroom", formula: `Storage x ${1 + STORAGE_HEADROOM}`, value: r1(storageWithHeadroomTb), unit: "TB" },
    { label: "Drives", formula: `Storage with headroom / ${s.driveTb.value} TB per drive, rounded up (add one more for RAID 5)`, value: drives, unit: drives === 1 ? "drive" : "drives" },
    { label: "Recorder channels", formula: "Cameras x 1.25 for growth, rounded up to a standard recorder size", value: recorderChannels, unit: "channels" },
    { label: "PoE load", formula: "Sum of each camera's maximum draw (IR and heater on): " + Object.entries(CAMERA_DEFAULTS).filter(([t]) => cameras.some((c) => c.type === t)).map(([t, v]) => `${CAMERA_TYPE_LABEL[t as CameraType]} ${v.poeW} W`).join(", "), value: poeTotalW, unit: "W" },
    { label: "UPS load", formula: `PoE load x ${SWITCH_OVERHEAD} for the switches + recorder ${RECORDER_W} W + ${DRIVE_W} W per drive`, value: Math.round(upsLoadW), unit: "W" },
    { label: "UPS rating", formula: `Load / power factor ${UPS_POWER_FACTOR}, rounded up to 100 VA`, value: upsVa, unit: "VA" },
    { label: "UPS battery energy", formula: `Load x ${s.upsMinutes.value} min / 60 / efficiency ${UPS_EFFICIENCY}`, value: Math.round(upsWh), unit: "Wh" },
  ];
  return { system: s, cameras, totalCameras: total, failing, bandwidthMbps, dailyGb, storageTb, storageWithHeadroomTb, drives, recorderChannels, switches, poeTotalW, upsLoadW, upsVa, upsWh, steps };
}

/** What a camera that misses its detail level could change, in plain words. */
export function cameraFix(c: CameraCheck): string {
  if (c.meets) return "";
  return `Reaches ${c.achieved ? DORI_LABEL[c.achieved] : "less than Detect"} (${Math.round(c.pxPerM)} px/m). For ${DORI_LABEL[c.detail]}, move it within ${r1(c.maxDistanceM)} m or narrow the view to about ${Math.round(c.neededFovDeg)}°${c.megapixels < 8 ? ", or use a higher resolution" : ""}.`;
}

/** The recorder, drives, switches and UPS that follow from the sizing, listed ahead of the AI's other equipment. */
export function cctvSizedEquipment(z: CctvSizing): DesignEquipment[] {
  const out: DesignEquipment[] = [
    { item: "Network video recorder", quantity: "1", specification: `At least ${z.recorderChannels} channels and ${Math.ceil(z.bandwidthMbps * 1.5)} Mbps incoming, ${z.drives}+ drive bays` },
    { item: "Surveillance hard drives", quantity: String(z.drives), specification: `${z.system.driveTb.value} TB each for about ${Math.round(z.storageWithHeadroomTb * 10) / 10} TB (${z.system.retentionDays.value} days); one more for RAID 5 protection` },
  ];
  for (const w of z.switches) out.push({ item: `PoE switch - ${w.area}`, quantity: "1", specification: `${w.ports} ports, PoE budget at least ${w.budgetW} W for ${w.poeW} W of cameras${w.needsAt ? ", with 802.3at ports for the high-power cameras" : ""}` });
  out.push({ item: "UPS", quantity: "1", specification: `At least ${z.upsVa} VA, about ${Math.round(z.upsWh)} Wh of battery for ${z.system.upsMinutes.value} minutes` });
  return out;
}
