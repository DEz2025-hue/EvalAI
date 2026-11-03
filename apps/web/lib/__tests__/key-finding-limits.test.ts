import { describe, it, expect } from "vitest";
import { KEY_FINDING_LIMITS, NARRATIVE_SECTIONS } from "@eval-ai/shared";
import { DRAFT_FINDING_LIMITS, REPORT_SECTION_MAX } from "@eval-ai/ai-adapter";

// The AI adapter cuts what the model writes to the limits the editors and the save route enforce. If they drifted apart, a draft
// would be refused when saved. The adapter does not depend on the shared package, so this test keeps the two in step.
describe("limits the AI parser and the report editors share", () => {
  it("each written part the AI can produce fits what a draft will accept", () => {
    expect(DRAFT_FINDING_LIMITS.title).toBeLessThanOrEqual(KEY_FINDING_LIMITS.title);
    expect(DRAFT_FINDING_LIMITS.observed).toBeLessThanOrEqual(KEY_FINDING_LIMITS.observed);
    expect(DRAFT_FINDING_LIMITS.meaning).toBeLessThanOrEqual(KEY_FINDING_LIMITS.meaning);
    expect(DRAFT_FINDING_LIMITS.action).toBeLessThanOrEqual(KEY_FINDING_LIMITS.action);
    expect(DRAFT_FINDING_LIMITS.basis).toBeLessThanOrEqual(KEY_FINDING_LIMITS.basis);
    expect(DRAFT_FINDING_LIMITS.max).toBeLessThanOrEqual(KEY_FINDING_LIMITS.max);
    for (const [key, max] of Object.entries(REPORT_SECTION_MAX)) {
      const section = NARRATIVE_SECTIONS.find((s) => s.key === key);
      expect(section, key).toBeTruthy();
      expect(max, key).toBeLessThanOrEqual(section!.max);
    }
  });
});
