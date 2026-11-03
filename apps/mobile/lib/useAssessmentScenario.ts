import { useEffect, useState } from "react";
import { scenarioFor, type Scenario } from "@eval-ai/shared";
import { apiFetch } from "./api";

/** The job's site situation (new installation or existing system). Falls back to "not set" if the job can't be read. */
export function useAssessmentScenario(assessmentId: string): { loaded: boolean; scenario: Scenario | null } {
  const [state, setState] = useState<{ loaded: boolean; scenario: Scenario | null }>({ loaded: false, scenario: null });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await apiFetch("/api/assessments/" + assessmentId);
        const data = (await res.json().catch(() => ({}))) as { mode?: "assessment" | "inspection"; context?: { scenario?: unknown } };
        if (live) setState({ loaded: true, scenario: res.ok && data.mode ? scenarioFor(data.mode, data.context?.scenario) : null });
      } catch {
        if (live) setState({ loaded: true, scenario: null });
      }
    })();
    return () => {
      live = false;
    };
  }, [assessmentId]);
  return state;
}
