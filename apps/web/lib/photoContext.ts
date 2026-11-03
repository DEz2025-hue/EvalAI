import type { PhotoJobContext } from "@eval-ai/ai-adapter";
import type { IntakeSummary } from "@eval-ai/shared";
import { buildSiteBrief } from "./store";
import type { loadAssessmentFacts } from "./aiRoute";

type Facts = Awaited<ReturnType<typeof loadAssessmentFacts>>;

/** The site facts a photo is read against: short, and only what helps to understand the place (D-035). */
export function photoSiteBrief(facts: Facts): Record<string, unknown> {
  const b = buildSiteBrief(facts.assessment, facts.assessment.context.intake as IntakeSummary | undefined);
  return {
    address: b.address,
    existingEquipment: b.existingEquipment,
    constraints: b.constraints,
    intake: b.intakeText,
    seenAtIntake: b.intakeVisible,
    interview: b.interview?.details,
  };
}

/**
 * Everything the AI needs to study one photo for the job, built on the server from stored data: the pack and situation, the goal and
 * site brief, the checklist item the photo is linked to (what it asks for, and what the person has recorded) and the other items.
 */
export function photoJobContext(facts: Facts, itemId?: string | null): PhotoJobContext {
  const a = facts.assessment;
  const item = itemId ? facts.items.find((i) => i.id === itemId) : undefined;
  const response = item ? facts.responses.find((r) => r.itemId === item.id) : undefined;
  return {
    pack: a.pack,
    mode: a.mode,
    scenario: facts.scenario,
    siteName: a.siteName,
    goal: typeof a.context.goal === "string" ? a.context.goal.slice(0, 1500) : undefined,
    siteBrief: photoSiteBrief(facts),
    item: item ? { title: item.title, category: item.category, lookFor: item.instructions?.slice(0, 1500), status: response?.status ?? "not_checked", notes: response?.notes?.slice(0, 2000) } : null,
    otherItems: facts.items.filter((i) => i.id !== item?.id).map((i) => i.title),
  };
}
