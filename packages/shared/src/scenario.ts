// Site situation (decision D-019): is there already a system on site, or is this a new installation?
// Assessments can be either. An inspection is always about something already installed.

export type Scenario = "new_install" | "existing";
export type JobMode = "assessment" | "inspection";

export type ScenarioInfo = {
  id: Scenario;
  label: string;
  hint: string;
  /** Wording for the free-text field that follows the choice. */
  equipmentLabel: string;
  equipmentPlaceholder: string;
  goalPlaceholder: string;
};

export const SCENARIOS: Record<Scenario, ScenarioInfo> = {
  new_install: {
    id: "new_install",
    label: "New installation",
    hint: "Nothing is installed yet. Survey the site and plan what to build.",
    equipmentLabel: "What does the customer want?",
    equipmentPlaceholder: "Requested system, size or number of cameras, budget if known",
    goalPlaceholder: "What should the new system achieve?",
  },
  existing: {
    id: "existing",
    label: "Existing system",
    hint: "A system is already installed. Check what is there and what condition it is in.",
    equipmentLabel: "What's installed",
    equipmentPlaceholder: "Make, model and age if known",
    goalPlaceholder: "Why is it being looked at — upgrade, repair, review or routine check?",
  },
};

export const SCENARIO_LIST: ScenarioInfo[] = Object.values(SCENARIOS);

export function isScenario(value: unknown): value is Scenario {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SCENARIOS, value);
}

/**
 * The situation that applies to a job. An inspection is always an existing system. For an assessment the stored value is
 * used if it is valid; otherwise null ("not set"), which older jobs have and which keeps today's checklist.
 */
export function scenarioFor(mode: JobMode, stored: unknown): Scenario | null {
  if (mode === "inspection") return "existing";
  return isScenario(stored) ? stored : null;
}

export function scenarioLabel(scenario: Scenario | null | undefined): string {
  return scenario ? SCENARIOS[scenario].label : "Not set";
}

/** One short line for AI prompts, so the model frames its questions and notes for the situation. */
export function scenarioPromptHint(scenario: Scenario | null | undefined): string {
  if (scenario === "new_install") return "Situation: NEW INSTALLATION. Nothing is installed yet; judge the site and what would need to be built, not the condition of equipment.";
  if (scenario === "existing") return "Situation: EXISTING SYSTEM. Equipment is already installed; judge what is there and its visible condition, and say what could not be checked.";
  return "";
}
