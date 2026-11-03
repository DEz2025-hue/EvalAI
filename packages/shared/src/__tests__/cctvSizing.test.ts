import { describe, it, expect } from "vitest";
import { cameraFix, cctvSizedEquipment, cctvSizing, horizontalPixels, sceneWidth, systemOf, DORI_PX_PER_M } from "../cctvSizing";
import { cleanDesign, type DesignProposal } from "../design";
import { buildReportHtml } from "../reportHtml";
import type { ReportInput, ReportSnapshot } from "../report";

// CCTV system sizing (D-037): image detail per camera, bandwidth, storage, recorder, PoE and UPS, all worked out in code.

const sv = (value: number, basis: "client" | "site" | "assumption" = "assumption") => ({ value, basis, note: "" });
const design = (over: Partial<DesignProposal> = {}): DesignProposal => ({
  basis: [{ item: "Retention", decision: "14 days", basis: "client" }],
  approach: ["Cover the entrances."],
  areas: [
    {
      name: "Shop",
      cameras: [
        { id: "G1", location: "Front door", type: "outdoor_dome", purpose: "Faces at the door", detail: "identify", distanceM: 3, megapixels: 4, fovDeg: 90 },
        { id: "G2", location: "Counter", type: "indoor_dome", purpose: "Till", detail: "identify", distanceM: 8, megapixels: 4, fovDeg: 100 },
      ],
      uncovered: [],
      notes: [],
    },
    { name: "Yard", cameras: [{ id: "X1", location: "Gate", type: "ptz", purpose: "Yard", detail: "observe", distanceM: 20, megapixels: 4, fovDeg: 60 }], uncovered: [], notes: [] },
  ],
  options: [],
  equipment: [],
  installation: [],
  openItems: [],
  nextSteps: [],
  system: { codec: "h265", recording: "continuous", fps: sv(15), motionShare: sv(0.35), retentionDays: sv(14, "client"), bitratePerMp: sv(0.6), driveTb: sv(8), upsMinutes: sv(30) },
  ...over,
});

describe("image detail per camera", () => {
  it("uses common sensor widths and the scene-width formula", () => {
    expect(horizontalPixels(4)).toBe(2560);
    expect(horizontalPixels(2)).toBe(1920);
    expect(sceneWidth(3, 90)).toBeCloseTo(6);
  });

  it("checks each camera against its required level and says how to fix one that falls short", () => {
    const z = cctvSizing(design());
    const g1 = z.cameras.find((c) => c.id === "G1")!;
    // 2560 px over a 6 m scene = 427 px/m: identifies.
    expect(Math.round(g1.pxPerM)).toBe(427);
    expect(g1).toMatchObject({ meets: true, achieved: "identify" });
    const g2 = z.cameras.find((c) => c.id === "G2")!;
    // 8 m at 100 degrees: scene about 19 m, about 134 px/m, which recognises but does not identify.
    expect(g2.meets).toBe(false);
    expect(g2.achieved).toBe("recognise");
    expect(g2.pxPerM).toBeLessThan(DORI_PX_PER_M.identify);
    expect(cameraFix(g2)).toMatch(/Reaches Recognise .* For Identify, move it within 4\.\d m or narrow the view to about \d+°/);
    expect(z.failing.map((c) => c.id)).toEqual(["G2"]);
  });

  it("fills gaps with planning defaults and says which were assumed", () => {
    const z = cctvSizing(design({ areas: [{ name: "A", cameras: [{ id: "C1", location: "Hall", type: "turret", purpose: "" }], uncovered: [], notes: [] }] }));
    expect(z.cameras[0]).toMatchObject({ detail: "observe", megapixels: 4, fovDeg: 90 });
    expect(z.cameras[0].assumed).toEqual(["detail", "distance", "resolution", "angle of view"]);
  });
});

describe("bandwidth, storage and recorder", () => {
  const z = cctvSizing(design());

  it("adds up bitrate from resolution, frame rate and codec", () => {
    // 3 cameras x 4 MP x 0.6 Mbps = 7.2 Mbps on H.265 at 15 fps.
    expect(z.bandwidthMbps).toBeCloseTo(7.2);
    const h264 = cctvSizing(design({ system: { ...design().system!, codec: "h264" } }));
    expect(h264.bandwidthMbps).toBeCloseTo(7.2 * 1.6);
  });

  it("works out storage for the retention with headroom, and whole drives", () => {
    // 7.2 Mbps x 86,400 / 8 / 1000 = 77.76 GB a day; x 14 days = 1.09 TB; x 1.15 = 1.25 TB -> 1 x 8 TB drive.
    expect(z.dailyGb).toBeCloseTo(77.76);
    expect(z.storageTb).toBeCloseTo(1.08864);
    expect(z.drives).toBe(1);
    expect(z.recorderChannels).toBe(4);
  });

  it("recording on motion stores only the share of the day it records", () => {
    const m = cctvSizing(design({ system: { ...design().system!, recording: "motion" } }));
    expect(m.dailyGb).toBeCloseTo(77.76 * 0.35);
  });
});

describe("PoE and UPS", () => {
  const z = cctvSizing(design());

  it("sizes a switch per area with spare ports and an 80% PoE load, and asks for 802.3at for a PTZ", () => {
    expect(z.switches).toEqual([
      { area: "Shop", cameras: 2, poeW: 17, ports: 4, budgetW: 65, needsAt: false },
      { area: "Yard", cameras: 1, poeW: 30, ports: 4, budgetW: 65, needsAt: true },
    ]);
    expect(z.poeTotalW).toBe(47);
  });

  it("sizes the UPS from the switches, recorder and drives", () => {
    // 47 x 1.1 + 40 + 8 = 99.7 W; / 0.7 = 142 VA -> 200 VA; 99.7 x 30 / 60 / 0.9 = 55 Wh.
    expect(z.upsLoadW).toBeCloseTo(99.7);
    expect(z.upsVa).toBe(200);
    expect(Math.round(z.upsWh)).toBe(55);
  });

  it("lists the recorder, drives, switches and UPS as equipment", () => {
    const eq = cctvSizedEquipment(z);
    expect(eq.map((e) => e.item)).toEqual(["Network video recorder", "Surveillance hard drives", "PoE switch - Shop", "PoE switch - Yard", "UPS"]);
    expect(eq[3].specification).toMatch(/802\.3at/);
  });
});

describe("settings and older designs", () => {
  it("a design saved before sizing existed sizes with planning defaults marked as assumptions", () => {
    const s = systemOf(design({ system: undefined }));
    expect(s).toMatchObject({ codec: "h265", recording: "motion", retentionDays: { value: 30, basis: "assumption" } });
  });

  it("cleanDesign keeps camera spec and settings in range and drops what is not a number", () => {
    const d = cleanDesign({
      areas: [{ name: "A", cameras: [{ id: "C1", location: "Door", detail: "identify", distanceM: "3.5 m", megapixels: 99, fovDeg: "wide" }] }],
      system: { codec: "mjpeg", recording: "continuous", retentionDays: { value: 9999, basis: "client" }, fps: "fast" },
    })!;
    expect(d.areas[0].cameras[0]).toMatchObject({ detail: "identify", distanceM: 3.5, megapixels: 33 });
    expect(d.areas[0].cameras[0].fovDeg).toBeUndefined();
    expect(d.system).toMatchObject({ codec: "h265", recording: "continuous", retentionDays: { value: 365, basis: "client" }, fps: { value: 15, basis: "assumption" } });
  });
});

describe("the system design in the report", () => {
  it("prints the figures, the shortfall with its fix, the settings, the steps and the switch points", () => {
    const snap: ReportSnapshot = { id: "s", assessmentId: "a", assessmentVersion: 1, checklistVersion: "v1", createdAt: "2026-11-03T00:00:00.000Z", createdBy: "u", finalized: false, immutable: true };
    const input: ReportInput = { siteName: "Corner shop", mode: "assessment", pack: "cctv", context: { scenario: "new_install" }, checklist: [], findings: [], measurements: [], limitations: [], narrative: { summary: "A design.", design: design() } };
    const html = buildReportHtml(snap, input);
    expect(html).toContain("System design");
    expect(html).toContain("Cameras short of the detail they need");
    expect(html).toContain("For Identify, move it within");
    expect(html).toContain("Storage for retention");
    expect(html).toContain("Network and PoE, by switch point");
    expect(html).toContain("PoE switch - Yard");
    expect(html).toContain("Identify at 3 m");
  });
});
