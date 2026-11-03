import { z } from "zod";

// Site situation (decision D-019): a new installation has nothing installed yet; an existing system does.
// The server decides the value from the stored job and the adapter turns it into one line the model can follow.

export const ScenarioField = z.enum(["new_install", "existing"]).optional();
export type SituationValue = z.infer<typeof ScenarioField>;

/** One short line for the prompt, or "" when the situation is not set. */
export function situationHint(scenario: unknown): string {
  if (scenario === "new_install") return "Situation: NEW INSTALLATION. Nothing is installed yet; judge the site and what would need to be built, not the condition of equipment.";
  if (scenario === "existing") return "Situation: EXISTING SYSTEM. Equipment is already installed; judge what is there and its visible condition, and say what could not be checked.";
  return "";
}
