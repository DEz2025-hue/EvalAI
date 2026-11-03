// LIVE trial of the senior review and project plan (D-039). Off by default: it calls the real AI provider, about 10 cents on Muse Wonder.
//
//   LIVE_PLAN_EVAL=1 pnpm --filter @eval-ai/ai-adapter exec vitest run src/__tests__/planReview.live.test.ts
//
// It reads the provider settings from apps/web/.env.local (never printed) and writes the result to packages/ai-adapter/eval-output/plan-eval-latest.md.
// The case has problems the checklist results hide: earthing marked Pass with a note that none exists, "no shade" against photo notes of tall palms,
// landlord sign-off against "no need for permission", and a required measurement marked Not applicable. Names and identifiers are made up.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { reviewAndPlan } from "../planReview";

const root = path.join(__dirname, "../../../..");

function loadEnv() {
  const file = path.join(root, "apps/web/.env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && /^(META_API_KEY|META_BASE_URL|META_WONDER_MODEL|AI_MODEL_PLAN|AI_EFFORT_PLAN)$/.test(m[1])) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

const item = (title: string, status: string, notes: string, category: string, evidenceCount = 0) => ({ title, status, notes, category, required: true, evidenceCount });

const RECORD = {
  workspaceId: "live-eval",
  assessmentId: "live-eval",
  siteName: "Sample Apartment",
  mode: "assessment" as const,
  pack: "solar" as const,
  scenario: "new_install" as const,
  goal: "Full backup power",
  siteBrief: { goal: "Full backup power", intakeText: "Two bedroom apartment with 10 energy saving bulbs, a 75 inch TV, games console, fibre router, mini fridge, microwave, 2 split ACs and two laptops." },
  glance: { total: 8, checked: 8, pass: 7, issue: 0, needsAttention: 0, notApplicable: 1, notChecked: 0, requiredNotChecked: 0 },
  checklist: [
    item("Site access, safety & isolation points", "pass", "All power cables are in the walls and ceiling. The only isolation so far is the main board in the kitchen.", "Site"),
    item("Roof / structure / mounting constraints", "pass", "The roof is okay for mounting. There is a single panel on the roof for the landlord.", "Site", 3),
    item("Orientation, tilt, shading survey", "pass", "No shade or anything so far. Sufficient space between the houses.", "Site"),
    item("Space for panels, inverter and batteries", "pass", "The only and best location is in the kitchen.", "Site", 1),
    item("Permits, approvals & grid connection requirements", "pass", "The landlord has agreed and signed the installation off.", "Customer"),
    item("Apartment tenure and exclusive-use areas", "pass", "The apartment has exclusive roof rights. There is no need for permission.", "Customer"),
    { ...item("Electrical supply - main board, earthing, spare capacity", "needs_attention", "Images of the main board and breakers attached.", "Electrical", 2), answers: [{ label: "Supply", value: "Single phase" }, { label: "Earthing", value: "Not installed", concern: true }, { label: "Board cover fitted", value: "No", concern: true }] },
    item("Measurements - roof area, cable runs, distances", "not_applicable", "I didn't have means to do a proper measurement.", "Measurements"),
  ],
  findings: [],
  findingsAwaitingReview: 0,
  measurements: [],
  materials: [],
  limitations: ["Measurements - roof area, cable runs, distances: marked Not applicable although it is required (I didn't have means to do a proper measurement.)"],
  photos: [
    { id: "ev1", itemTitle: "Roof / structure / mounting constraints", caption: "Low-pitched corrugated metal roof.", observations: ["Tall palm trees stand behind the house, taller than the roof line", "The adjoining section shows apparent heavy rust and patched sheets"], possibleIssues: ["Tall palms could cause shading, which disagrees with the note stating no shade"], cannotTell: ["Roof orientation", "Structural strength"] },
    { id: "ev2", itemTitle: "Space for panels, inverter and batteries", caption: "Kitchen corner beside a cupboard.", observations: ["Wall shows apparent damp staining along the lower band"], possibleIssues: ["Moisture staining could affect a dry location needed for electrical equipment"], cannotTell: ["Ventilation", "Clearances"] },
    { id: "ev3", itemTitle: "Electrical supply - main board, earthing, spare capacity", caption: "Main board with six breakers in an open enclosure.", observations: ["No front cover visible, wiring looks untidy, breakers include C63 and C32"], possibleIssues: ["Cover appears missing and wiring looks exposed, so touch safety should be checked"], cannotTell: ["Earthing adequacy", "Supply type"] },
  ],
};

describe.skipIf(!process.env.LIVE_PLAN_EVAL)("live plan review", () => {
  it("finds what the checklist results hide and plans the project", async () => {
    loadEnv();
    const t0 = Date.now();
    const r = await reviewAndPlan(RECORD, {}, { request: { timeoutMs: 180_000 } });
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);
    const dir = path.join(root, "packages/ai-adapter/eval-output");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "plan-eval-latest.md"),
      `# Plan review (live)\n\nModel: ${r.model}. Time: ${seconds} s.\nDropped: ${r.droppedHolds.join("; ") || "none"}. Unverified figures: ${r.unverifiedFigures.join("; ") || "none"}.\n\n## Holds\n\n` +
        r.holds.map((h) => `- **${h.title}** (${h.priority}): ${h.why}\n  - Do: ${h.action}\n  - Based on: ${h.basis.map((b) => b.ref).join("; ")}`).join("\n") +
        "\n\n## Phases\n\n" +
        r.phases.map((p, i) => `${i + 1}. **${String(p.name)}** (${String(p.owner)})${p.holdPoint ? " HOLD" : ""}: ${String(p.goal)}\n${(p.tasks as string[]).map((t) => `   - ${t}`).join("\n")}\n   - Finished when: ${String(p.doneWhen)}`).join("\n") +
        "\n",
    );
    const holds = r.holds.map((h) => `${h.title} ${h.why}`).join(" ").toLowerCase();
    expect(holds).toContain("earth");
    expect(holds).toMatch(/palm|shad/);
    expect(r.phases.length).toBeGreaterThanOrEqual(4);
  }, 400_000);
});
