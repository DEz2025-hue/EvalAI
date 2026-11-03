import { describe, expect, it } from "vitest";
import { ITEM_FIELDS, aiFieldsFor, answerConcerns, answerMeasurements, answerRows, applyAnswer, blankFields, cleanAnswers, concernText, fieldsFor, statusFromAnswers } from "../itemFields";
import { PACK_TEMPLATES } from "../packs";
import { responseProblem } from "../checklist";
import { computeCompleteness } from "../completeness";
import { buildProjectPlan } from "../projectPlan";
import { buildKeyFindings } from "../reportOverview";
import { buildReportHtml } from "../reportHtml";
import type { ReportChecklistRow, ReportInput, ReportSnapshot } from "../report";

const ROOF = "Roof / structure / mounting constraints";
const GOOD = { material: "Tile", condition: "Good", length: 12, width: 6, structure: "Verified", mounting: "Suitable" };

describe("the field definitions", () => {
  const titles = Object.values(PACK_TEMPLATES).flatMap((p) => [...p.checklist, ...p.newInstallChecklist]);

  it("cover every template item, in both packs and both situations", () => {
    expect(titles.filter((t) => !fieldsFor(t))).toEqual([]);
  });

  it("have nothing that could not be answered or that an AI could vouch for", () => {
    for (const [title, set] of Object.entries(ITEM_FIELDS)) {
      expect(set.fields.length, title).toBeLessThanOrEqual(8);
      expect(new Set(set.fields.map((f) => f.key)).size, title).toBe(set.fields.length);
      for (const f of set.fields) {
        if (f.type !== "choice") continue;
        expect(f.options.length, `${title} ${f.key}`).toBeGreaterThan(1);
        for (const c of f.concern ?? []) expect(f.options, `${title} ${f.key}`).toContain(c);
        if (f.aiCanSuggest) expect(f.options, `${title} ${f.key}`).not.toContain("Verified");
      }
    }
  });

  it("match the roof list as asked for", () => {
    expect(fieldsFor(ROOF)?.photoRequired).toBe(true);
    expect(fieldsFor(ROOF)?.fields.map((f) => f.label)).toEqual(["Roof material", "Roof condition", "Roof length", "Roof width", "Roof pitch, if measured", "Structural condition", "Mounting surface"]);
  });

  it("never offer an AI a number or the structural verdict", () => {
    expect(aiFieldsFor(ROOF).map((f) => f.key)).toEqual(["material", "condition"]);
  });
});

describe("cleanAnswers", () => {
  it("keeps only the item's own fields, listed choices and sensible numbers", () => {
    expect(cleanAnswers(ROOF, { material: "Tile", condition: "Excellent", length: 12, width: -3, pitch: "steep", evil: "x" })).toEqual({ material: "Tile", length: 12 });
    expect(cleanAnswers(ROOF, "nonsense")).toEqual({});
    expect(cleanAnswers("Something a person typed", { material: "Tile" })).toEqual({});
  });
});

describe("the status follows the answers", () => {
  it("is not checked until everything required is answered, with optional fields left out", () => {
    expect(statusFromAnswers(ROOF, {})).toBe("not_checked");
    expect(statusFromAnswers(ROOF, { material: "Tile" })).toBe("not_checked");
    expect(blankFields(ROOF, GOOD)).toEqual([]);
    expect(statusFromAnswers(ROOF, GOOD)).toBe("pass");
  });

  it("needs attention as soon as one answer is a concern", () => {
    expect(statusFromAnswers(ROOF, { structure: "Not verified" })).toBe("needs_attention");
    expect(answerConcerns(ROOF, { ...GOOD, structure: "Not verified", mounting: "Unknown" })).toEqual([{ label: "Structural condition", value: "Not verified" }, { label: "Mounting surface", value: "Unknown" }]);
  });

  it("leaves a person's own Issue found or Not applicable alone, and clearing a field undoes it", () => {
    expect(applyAnswer(ROOF, "fail", GOOD, "material", "Concrete").status).toBe("fail");
    expect(applyAnswer(ROOF, "not_applicable", {}, "material", "Tile").status).toBe("not_applicable");
    const set = applyAnswer(ROOF, "not_checked", { material: "Tile" }, "structure", "Not verified");
    expect(set.status).toBe("needs_attention");
    expect(applyAnswer(ROOF, set.status, set.answers, "structure", undefined)).toEqual({ answers: { material: "Tile" }, status: "not_checked" });
  });
});

describe("responseProblem", () => {
  const item = { title: ROOF, required: true };

  it("refuses Pass beside a concern, which is how 'Pass: no earthing' happened", () => {
    expect(responseProblem({ status: "pass", answers: { structure: "Not verified" } }, item)).toMatch(/can't be Pass while Structural condition is "Not verified"/);
    expect(responseProblem({ status: "needs_attention", answers: { structure: "Not verified" } }, item)).toBeNull();
    expect(responseProblem({ status: "pass", answers: GOOD }, item)).toBeNull();
    expect(responseProblem({ status: "pass" }, item)).toBeNull();
  });
});

describe("completeness", () => {
  const base = { evidenceItemIds: [] as string[], findings: [], materials: null, quotations: [], clarificationAnswered: true };
  const items = [{ id: "i1", title: ROOF, required: true }];
  const codes = (r: { code: string }[]) => r.map((x) => x.code);

  it("blocks sign-off of an answered item with no photo, and clears once one is linked", () => {
    const answered = { ...base, items, responses: [{ itemId: "i1", status: "pass", answers: GOOD }] };
    expect(codes(computeCompleteness(answered).blockers)).toContain("photo_required");
    expect(codes(computeCompleteness({ ...answered, evidenceItemIds: ["i1"] }).blockers)).not.toContain("photo_required");
  });

  it("does not block a job answered before the fields existed, but says so", () => {
    const r = computeCompleteness({ ...base, items, responses: [{ itemId: "i1", status: "pass" }] });
    expect(codes(r.blockers)).not.toContain("photo_required");
    expect(codes(r.warnings)).toContain("fields_empty");
  });

  it("warns about each blank required field, and not on an item marked Not applicable", () => {
    const part = computeCompleteness({ ...base, items, responses: [{ itemId: "i1", status: "needs_attention", answers: { structure: "Not verified" } }] });
    expect(part.warnings.find((w) => w.code === "fields_blank")?.reason).toContain("Roof length");
    const na = computeCompleteness({ ...base, items, responses: [{ itemId: "i1", status: "not_applicable", answers: { material: "Tile" } }] });
    expect(codes(na.warnings)).not.toContain("fields_blank");
    expect(codes(na.blockers)).not.toContain("photo_required");
  });

  it("counts a typed number as the measurement a measurement item asks for", () => {
    const title = "Measurements — roof area, cable runs, distances";
    const r = computeCompleteness({ ...base, items: [{ id: "m", title, required: true }], responses: [{ itemId: "m", status: "pass", answers: { area: 40, cable: 12, method: "Tape or laser" } }] });
    expect(codes(r.warnings)).not.toContain("measurement_missing");
  });
});

describe("the report reads the answers", () => {
  const answers = answerRows("Electrical supply — main board, earthing, spare capacity", { supply: "Single phase", earthing: "Not installed" });
  const row: ReportChecklistRow = { title: "Electrical supply", status: "needs_attention", required: true, answers };
  const input: ReportInput = { siteName: "T", mode: "assessment", pack: "solar", context: { scenario: "new_install" }, checklist: [row], findings: [], measurements: [], limitations: [] };
  const snapshot: ReportSnapshot = { id: "s", assessmentId: "a", assessmentVersion: 1, checklistVersion: "v", createdAt: "x", createdBy: "u", finalized: false, immutable: true };

  it("prints what a person answered, marking the concern", () => {
    expect(answers).toEqual([{ label: "Supply", value: "Single phase" }, { label: "Earthing", value: "Not installed", concern: true }]);
    expect(concernText(row)).toBe("Earthing: Not installed.");
    expect(buildReportHtml(snapshot, input)).toContain('Earthing: <strong style="color:#b45309">Not installed</strong>');
  });

  it("turns a concern into a finding and a hold with no AI at all, even with no note", () => {
    expect(buildKeyFindings(input)[0].observed).toContain("Earthing: Not installed.");
    expect(buildProjectPlan(input).holds[0]).toMatchObject({ title: "Electrical supply", why: "Earthing: Not installed." });
  });

  it("gives typed numbers to the measurements, with their units", () => {
    expect(answerMeasurements(ROOF, GOOD)).toEqual([{ name: "Roof length", value: 12, unit: "m" }, { name: "Roof width", value: 6, unit: "m" }]);
    expect(answerRows(ROOF, { length: 12 })).toEqual([{ label: "Roof length", value: "12 m" }]);
  });
});
