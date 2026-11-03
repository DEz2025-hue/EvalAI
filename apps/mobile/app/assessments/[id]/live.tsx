import { useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { startHereFor, type IntakeSummary, type WalkItem, type WalkStatuses } from "@eval-ai/shared";
import { apiFetch } from "../../../lib/api";
import { usePhoneCamera } from "../../../lib/usePhoneCamera";
import { useNarration } from "../../../lib/useNarration";
import { LiveSession } from "../../../components/LiveSession";
import { InterviewSession } from "../../../components/InterviewSession";
import { Chip, Screen } from "../../../components/ui";
import { View } from "react-native";
import type { InterviewState } from "@eval-ai/shared";

/**
 * Live session (beta, decisions D-015, D-017, D-023): periodic and manual frames plus narration, walking the job's checklist.
 * The camera here is the phone's; Meta glasses would plug in as another frame source (see lib/liveSource.ts and D-016).
 */
export default function MobileLive() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const assessmentId = String(id);
  const router = useRouter();
  const handle = usePhoneCamera();
  const narration = useNarration();
  const [items, setItems] = useState<WalkItem[]>([]);
  const [statuses, setStatuses] = useState<WalkStatuses>({});
  const [startHereId, setStartHereId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [interview, setInterview] = useState<InterviewState | null>(null);
  // Interview (D-030) is the default way in; the camera walk is the existing beta. Picking one never ends the other.
  const [mode, setMode] = useState<"interview" | "camera">("interview");

  // The checklist (with what to look for), the answers so far, and the Start here item. The session still works without them.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await apiFetch("/api/assessments/" + assessmentId);
        const data = (await res.json().catch(() => ({}))) as {
          checklist?: Array<{ id: string; title: string; instructions?: string }>;
          responses?: Array<{ itemId: string; status?: string }>;
          context?: { intake?: IntakeSummary; interview?: InterviewState };
        };
        if (!live || !res.ok) return;
        const list = (data.checklist ?? []).map((i) => ({ id: i.id, title: i.title, instructions: i.instructions }));
        setItems(list);
        setStatuses(Object.fromEntries((data.responses ?? []).map((r) => [r.itemId, r.status])));
        setStartHereId(startHereFor(data.context?.intake, list)?.itemId ?? null);
        setInterview(data.context?.interview ?? null);
      } catch {
        /* no checklist; the session still works as a camera with narration */
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [assessmentId]);

  return (
    <Screen>
      <Stack.Screen options={{ title: "Live session" }} />
      {ready ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Interview" icon="chatbubbles-outline" active={mode === "interview"} onPress={() => setMode("interview")} />
          <Chip label="Camera walk (beta)" icon="videocam-outline" active={mode === "camera"} onPress={() => setMode("camera")} />
        </View>
      ) : null}
      {ready && mode === "interview" ? (
        <InterviewSession
          assessmentId={assessmentId}
          items={items}
          initial={interview}
          onOpenJob={() => router.replace(`/assessments/${assessmentId}` as never)}
          onPrepareReport={() => router.replace(`/assessments/${assessmentId}/report?prepare=1` as never)}
        />
      ) : null}
      {ready && mode === "camera" ? (
        <LiveSession
          assessmentId={assessmentId}
          items={items}
          initialStatuses={statuses}
          startHereId={startHereId}
          handle={handle}
          narration={narration}
          onOpenJob={() => router.replace(`/assessments/${assessmentId}` as never)}
          onPrepareReport={() => router.replace(`/assessments/${assessmentId}/report?prepare=1` as never)}
        />
      ) : null}
    </Screen>
  );
}
