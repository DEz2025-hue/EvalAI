import { describe, it, expect } from "vitest";
import { findOverlap, dropOverlaps, meaningWords } from "../checklistOverlap";

// The real solar new-install and CCTV new-install template items, with the guidance text the checklist shows for them.
const solar = [
  { title: "Site access, safety & isolation points", covers: "Note how to get on site safely and where power can be isolated." },
  { title: "Roof / structure / mounting constraints", covers: "Roof type, material, condition and anything that limits how panels can be fixed." },
  { title: "Space for panels, inverter and batteries" },
  { title: "Orientation, tilt, shading survey" },
  { title: "Load audit — demand & operating hours" },
  { title: "Electrical supply — main board, earthing, spare capacity" },
  { title: "Cable routes & distances (array, inverter, board)" },
  { title: "Customer goals, budget & constraints" },
  { title: "Permits, approvals & grid connection requirements" },
  { title: "Measurements — roof area, cable runs, distances" },
];
const cctv = [
  { title: "Coverage goals & camera count" },
  { title: "Camera positions & field of view (per area)" },
  { title: "Lighting conditions (day and night)" },
  { title: "Recorder location & storage requirements" },
  { title: "Network & power availability" },
  { title: "Cabling routes & containment" },
  { title: "Mounting surfaces & height access" },
  { title: "Retention & resolution requirements" },
  { title: "Privacy, signage & legal considerations" },
];

describe("checklist overlap: suggestions that repeat the checklist", () => {
  it("catches the same title, reworded titles and sub-checks of a template item", () => {
    const repeats: Array<[string, string[]]> = [
      ["Electrical supply and earthing", ["solar"]],
      ["Shading analysis", ["solar"]],
      ["Cable routing", ["solar"]],
      ["Roof structure and mounting", ["solar"]],
      ["Permit and grid approvals", ["solar"]],
      ["Customer budget", ["solar"]],
      ["NVR storage requirements", ["cctv"]],
      ["Camera field of view", ["cctv"]],
      ["Cable containment", ["cctv"]],
      ["Day and night lighting", ["cctv"]],
      ["Privacy and signage", ["cctv"]],
      ["Network and power supply", ["cctv"]],
    ];
    for (const [title, [pack]] of repeats) expect(findOverlap(title, pack === "solar" ? solar : cctv), title).toBeDefined();
  });

  it("is case and punctuation blind", () => {
    expect(findOverlap("  LOAD AUDIT — demand & operating hours ", solar)?.title).toMatch(/^Load audit/);
  });

  it("keeps genuinely new items for this job", () => {
    const fresh: Array<[string, typeof solar]> = [
      ["Fire safety and extinguisher access near the inverter", solar],
      ["Inverter ventilation and heat build-up", solar],
      ["Bird and pest exclusion under the array", solar],
      ["Lightning and surge protection", solar],
      ["Roof load capacity for the added weight", solar],
      ["Existing internet connection for remote monitoring", solar],
      ["Vandal protection for low cameras", cctv],
      ["Cable run to the yard camera", cctv],
      ["Number plate capture at the gate", cctv],
      ["Backup power for the recorder", cctv],
    ];
    for (const [title, list] of fresh) expect(findOverlap(title, list), title).toBeUndefined();
  });

  it("uses what an item covers for longer suggestions, but not for short ones", () => {
    expect(findOverlap("Roof material and condition", solar)?.title).toMatch(/^Roof/);
    // "Isolation" alone is not in any title; one word matched only in covers text is not treated as a repeat.
    expect(findOverlap("Power", [{ title: "Site access", covers: "where power can be isolated" }])).toBeUndefined();
  });

  it("drops a suggestion that repeats an earlier suggestion in the same list, and reports what it repeated", () => {
    const { kept, skipped } = dropOverlaps([{ title: "Surge protection devices" }, { title: "Surge protection" }, { title: "Shading analysis" }], solar);
    expect(kept.map((k) => k.title)).toEqual(["Surge protection devices"]);
    expect(skipped).toEqual([
      { title: "Surge protection", duplicateOf: "Surge protection devices" },
      { title: "Shading analysis", duplicateOf: "Orientation, tilt, shading survey" },
    ]);
  });

  it("an empty checklist skips nothing", () => {
    expect(dropOverlaps([{ title: "Anything" }], []).skipped).toEqual([]);
  });

  it("reduces words to their meaning", () => {
    expect([...meaningWords("Wiring, protection & earthing review")].sort()).toEqual(["cable", "earth", "protection"]);
    expect(meaningWords("Cabling routes & containment")).toEqual(new Set(["cable", "route"]));
  });
});

describe("the template checklists themselves", () => {
  it("lists template items that overlap each other (information for the template owner)", () => {
    const overlaps: string[] = [];
    for (const list of [solar, cctv]) {
      list.forEach((a, i) => {
        const others = list.filter((_, j) => j !== i);
        const hit = findOverlap(a.title, others);
        if (hit) overlaps.push(`${a.title}  ~  ${hit.title}`);
      });
    }
    // Not an assertion about the right answer: it records which pairs the check sees, so a change to the templates or the check shows up here.
    expect(overlaps).toMatchInlineSnapshot(`[]`);
  });
});
