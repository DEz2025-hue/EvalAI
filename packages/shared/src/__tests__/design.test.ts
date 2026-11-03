import { describe, it, expect } from "vitest";
import { cameraTypeOf, cleanDesign, designCounts, hasDesign, isDesignJob, DESIGN_LIMITS, type DesignProposal } from "../design";
import { reportLayout } from "../reportOverview";
import { buildReportHtml } from "../reportHtml";
import { previewKey } from "../reportGate";
import type { ReportInput, ReportSnapshot } from "../report";

// Design proposals for new CCTV installations (D-034).

const sampleDesign: DesignProposal = {
  basis: [
    { item: "Recording", decision: "Motion only, kept for 30 days", basis: "client" },
    { item: "Audio", decision: "None on any camera", basis: "client" },
    { item: "Recorder location", decision: "Ground floor server room", basis: "assumption" },
  ],
  approach: ["Every entrance, stair landing and corridor is covered.", "High-risk rooms get a camera inside."],
  areas: [
    {
      name: "Ground floor",
      cameras: [
        { id: "G1", location: "Front entrance (outside)", type: "outdoor_dome", purpose: "Entrance and approach" },
        { id: "G2", location: "Front stairs", type: "indoor_dome", purpose: "Stairwell and landing" },
        { id: "G3", location: "Server room, south-west corner", type: "indoor_dome", purpose: "Rack area" },
      ],
      uncovered: ["Staff office - ordinary office"],
      notes: ["Both entrances are watched from outside."],
    },
    { name: "Compound and gates", cameras: [{ id: "X1", location: "Main gate, in view", type: "lpr", purpose: "Plates of vehicles entering" }], uncovered: [], notes: [] },
  ],
  options: [{ area: "Compound", gap: "Right side gate has no plate camera", option: "2 LPR cameras", extraCameras: 2 }],
  equipment: [{ item: "Network video recorder", quantity: "1", specification: "At least 16 channels" }],
  installation: ["Survey", "Cabling and cabinets"],
  openItems: [{ item: "Recorder location", status: "To be confirmed" }],
  nextSteps: ["Confirm the open items with the client."],
};

const snap: ReportSnapshot = { id: "snap_d", assessmentId: "a1", assessmentVersion: 1, checklistVersion: "v1", createdAt: "2026-11-03T00:00:00.000Z", createdBy: "u", finalized: false, immutable: true };
const input = (design?: DesignProposal): ReportInput => ({
  siteName: "Head office",
  mode: "assessment",
  pack: "cctv",
  context: { scenario: "new_install" },
  checklist: [],
  findings: [],
  measurements: [],
  limitations: ["The compound was not measured"],
  narrative: { summary: "A design for the head office.", ...(design ? { design } : {}) },
});

describe("cleanDesign", () => {
  it("keeps a valid design as it is", () => {
    expect(cleanDesign(sampleDesign)).toEqual(sampleDesign);
  });

  it("returns null for nothing, a non-object, or a design with no cameras and no decisions", () => {
    expect(cleanDesign(null)).toBeNull();
    expect(cleanDesign("a design")).toBeNull();
    expect(cleanDesign({ areas: [{ name: "Ground floor", cameras: [] }], basis: [] })).toBeNull();
  });

  it("drops empty rows, trims and caps text, and maps camera types from free text", () => {
    const d = cleanDesign({
      basis: [{ item: "  Audio ", decision: "None", basis: "nonsense" }, { item: "", decision: "no topic" }],
      areas: [
        { name: "", cameras: [{ id: "Z1", location: "Lost", type: "dome" }] },
        { name: "Yard", cameras: [{ id: "x1", location: "Gate", type: "ANPR camera" }, { id: "x2", location: "  ", type: "ptz" }, { id: "x3", location: "Fence end", type: "Bullet" }, { id: "x4", location: "x".repeat(500), type: "weird" }] },
      ],
      approach: ["", "  Cover the gate  "],
    })!;
    expect(d.basis).toEqual([{ item: "Audio", decision: "None", basis: "assumption" }]);
    expect(d.areas).toHaveLength(1);
    expect(d.areas[0].cameras.map((c) => [c.id, c.type])).toEqual([["X1", "lpr"], ["X3", "outdoor_bullet"], ["X4", "other"]]);
    expect(d.areas[0].cameras[2].location).toHaveLength(DESIGN_LIMITS.short);
    expect(d.approach).toEqual(["Cover the gate"]);
    expect(d.options).toEqual([]);
  });

  it("makes camera IDs unique across the whole design and numbers cameras with no ID", () => {
    const d = cleanDesign({ areas: [{ name: "A", cameras: [{ id: "C1", location: "One" }, { id: "c1", location: "Two" }] }, { name: "B", cameras: [{ id: "", location: "Three" }] }] })!;
    const ids = d.areas.flatMap((a) => a.cameras.map((c) => c.id));
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe("C1");
    expect(ids[2]).toBe("C3");
  });

  it("never holds more cameras than the limit, and option counts stay whole and small", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: "", location: "Spot " + i, type: "indoor_dome" }));
    const d = cleanDesign({ areas: Array.from({ length: 6 }, (_, i) => ({ name: "Area " + i, cameras: many })), options: [{ gap: "Gap", extraCameras: 2.6 }, { gap: "Big", extraCameras: 500 }, { gap: "Bad", extraCameras: -3 }] })!;
    expect(designCounts(d).total).toBe(DESIGN_LIMITS.cameras);
    expect(d.options.map((o) => o.extraCameras)).toEqual([3, 99, 0]);
  });
});

describe("designCounts", () => {
  it("counts cameras by area and by type from the schedule, with where each type is used", () => {
    const c = designCounts(sampleDesign);
    expect(c.total).toBe(4);
    expect(c.byArea).toEqual([{ name: "Ground floor", count: 3 }, { name: "Compound and gates", count: 1 }]);
    expect(c.byType.map((t) => [t.type, t.count, t.where])).toEqual([["indoor_dome", 2, ["Ground floor"]], ["outdoor_dome", 1, ["Ground floor"]], ["lpr", 1, ["Compound and gates"]]]);
    expect(c.optionalExtra).toBe(2);
  });
});

describe("which jobs get a design", () => {
  it("is a new CCTV installation only", () => {
    expect(isDesignJob("cctv", "new_install")).toBe(true);
    expect(isDesignJob("cctv", "existing")).toBe(false);
    expect(isDesignJob("solar", "new_install")).toBe(false);
    expect(isDesignJob("cctv", undefined)).toBe(false);
  });

  it("maps the usual names of camera types", () => {
    expect(["Indoor dome", "outdoor dome", "PTZ", "LPR camera", "fisheye 360", "eyeball turret"].map(cameraTypeOf)).toEqual(["indoor_dome", "outdoor_dome", "ptz", "lpr", "fisheye", "turret"]);
  });
});

describe("the design in the report", () => {
  it("uses the design layout only when the draft holds a design", () => {
    expect(reportLayout(input(sampleDesign))).toBe("design");
    expect(reportLayout(input())).toBe("findings");
    expect(hasDesign(undefined)).toBe(false);
  });

  it("prints counts, the decisions, every camera, the options total, equipment with camera rows and the open items", () => {
    const html = buildReportHtml(snap, input(sampleDesign));
    expect(html).toContain("CCTV system design proposal");
    expect(html).toContain("The proposed system: 4 cameras");
    expect(html).toContain("Design basis");
    expect(html).toContain("Decisions marked Assumption");
    for (const id of ["G1", "G2", "G3", "X1"]) expect(html).toContain(`<strong>${id}</strong>`);
    expect(html).toContain("No camera inside: Staff office - ordinary office.");
    expect(html).toContain("Taking all of them would add 2 cameras, for a total of 6.");
    expect(html).toContain("Licence plate (LPR) camera");
    expect(html).toContain("Network video recorder");
    expect(html).toContain("Assumptions and open items");
    expect(html).toContain("The compound was not measured");
    expect(html).not.toContain("Key findings");
  });

  it("escapes everything the AI or an editor wrote", () => {
    const d = { ...sampleDesign, areas: [{ ...sampleDesign.areas[0], name: "<script>alert(1)</script>" }] };
    const html = buildReportHtml(snap, input(d));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("an edited design means the draft must be previewed again", () => {
    const a = previewKey({ id: "s1", finalized: false, payload: { narrative: { design: sampleDesign } } });
    const moved = { ...sampleDesign, areas: [{ ...sampleDesign.areas[0], cameras: sampleDesign.areas[0].cameras.slice(1) }, sampleDesign.areas[1]] };
    expect(previewKey({ id: "s1", finalized: false, payload: { narrative: { design: moved } } })).not.toBe(a);
  });
});
