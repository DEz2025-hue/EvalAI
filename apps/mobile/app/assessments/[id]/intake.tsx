import { useMemo } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { realIntakeDeps } from "../../../lib/intakeApi";
import { useAssessmentScenario } from "../../../lib/useAssessmentScenario";
import { SiteIntake } from "../../../components/SiteIntake";
import { Loading, Screen } from "../../../components/ui";

/** Site intake (D-021): describe the site or take photos so the app can say where to start and what to look for. */
export default function MobileIntake() {
  const { id, first } = useLocalSearchParams<{ id: string; first?: string }>();
  const assessmentId = String(id);
  const router = useRouter();
  const deps = useMemo(() => realIntakeDeps(assessmentId), [assessmentId]);
  const { loaded, scenario } = useAssessmentScenario(assessmentId);
  return (
    <Screen>
      <Stack.Screen options={{ title: "Site intake" }} />
      {loaded ? (
        <SiteIntake assessmentId={assessmentId} scenario={scenario} deps={deps} firstRun={first === "1"} onFinish={() => router.replace(`/assessments/${assessmentId}` as never)} />
      ) : (
        <Loading label="Loading…" />
      )}
    </Screen>
  );
}
