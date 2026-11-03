import { useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { LIVE_CAMERA_ENABLED, startHereFor, type IntakeSummary, type WalkItem, type WalkStatuses } from "@eval-ai/shared";
import { apiFetch } from "../../../lib/api";
import { usePhoneCamera } from "../../../lib/usePhoneCamera";
import { useNarration } from "../../../lib/useNarration";
import { LiveSession } from "../../../components/LiveSession";
import { InterviewSession } from "../../../components/InterviewSession";
import { Chip, Screen } from "../../../components/ui";
import { View } from "react-native";
import type { InterviewState } from "@eval-ai/shared";

/**
 * The camera walk (beta, decisions D-015, D-017, D-023): periodic and manual frames plus narration, walking the job's checklist. Kept in its
 * own component so the camera and microphone are only set up when it is shown; while live guidance is off (D-038) it never mounts.
 */
function CameraWalk(props: { assessmentId: string; items: WalkItem[]; statuses: WalkStatuses; startHereId: string | null; onOpenJob: () => void; onPrepareReport: () => void }) {
  const handle = usePhoneCamera();
  const narration = useNarration();
  return (
    <LiveSession
      assessmentId={props.assessmentId}
      items={props.items}
      initialStatuses={props.statuses}
      startHereId={props.startHereId}
      handle={handle}
      narration={narration}
      onOpenJob={props.onOpenJob}
      onPrepareReport={props.onPrepareReport}
    />
  );
}

/**
 * The site interview (D-030), and, when live guidance is on, the camera walk beside it. The camera here is the phone's; Meta glasses would
 * plug in as another frame source (see lib/liveSource.ts and D-016).
 */
export default function MobileLive() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const assessmentId = String(id);
  const router = useRouter();
  const [items, setItems] = useState<WalkItem[]>([]);
  const [statuses, setStatuses] = useState<WalkStatuses>({});
  const [startHereId, setStartHereId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [interview, setInterview] = useState<InterviewState | null>(null);
  // Interview (D-030) is the default way in; the camera walk is the beta. Picking one never ends the other.
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

  const openJob = () => router.replace(`/assessments/${assessmentId}` as never);
  const prepareReport = () => router.replace(`/assessments/${assessmentId}/report?prepare=1` as never);

  return (
    <Screen>
      <Stack.Screen options={{ title: LIVE_CAMERA_ENABLED ? "Live session" : "Site interview" }} />
      {ready && LIVE_CAMERA_ENABLED ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Interview" icon="chatbubbles-outline" active={mode === "interview"} onPress={() => setMode("interview")} />
          <Chip label="Camera walk (beta)" icon="videocam-outline" active={mode === "camera"} onPress={() => setMode("camera")} />
        </View>
      ) : null}
      {ready && (mode === "interview" || !LIVE_CAMERA_ENABLED) ? (
        <InterviewSession assessmentId={assessmentId} items={items} initial={interview} onOpenJob={openJob} onPrepareReport={prepareReport} />
      ) : null}
      {ready && LIVE_CAMERA_ENABLED && mode === "camera" ? (
        <CameraWalk assessmentId={assessmentId} items={items} statuses={statuses} startHereId={startHereId} onOpenJob={openJob} onPrepareReport={prepareReport} />
      ) : null}
    </Screen>
  );
}
