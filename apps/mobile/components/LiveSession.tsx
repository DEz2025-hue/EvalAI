import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { Alert, AppState, Image, Pressable, View } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import {
  LIVE_INITIAL,
  LIVE_INTERVALS_S,
  LIVE_MAX_FRAMES,
  LIVE_MAX_SECONDS,
  LIVE_SEGMENT_SECONDS,
  classifyLiveFailure,
  findNumberClaims,
  formatElapsed,
  linkFramesToSegments,
  liveIndicator,
  liveReducer,
  liveStopMessage,
  narrationNoteLine,
  shouldAnalyze,
  shouldAutoCapture,
  shouldCloseSegment,
  startIndex,
  stepIndex,
  summarizeWalk,
  walkProgress,
  type LiveFrameResult,
  type LiveNote,
  type WalkItem,
  type WalkStatuses,
} from "@eval-ai/shared";
import { apiFetch } from "../lib/api";
import { useRole } from "../lib/role";
import { uploadEvidence } from "../lib/upload";
import { appendItemNote, setItemStatus, type ItemStatus } from "../lib/itemNotes";
import type { NarrationHandle, NarrationPiece } from "../lib/useNarration";
import { discardFile, type FrameSource } from "../lib/liveSource";
import { CHECK_STATUSES, checkStatus, colors, radius, space } from "../lib/theme";
import { ItemChips } from "./ItemChips";
import { Badge, Banner, Button, Card, Chip, Field, SectionHeader, Text } from "./ui";

/** Everything the session needs from a frame source: the source itself, its preview, and its access state. */
export type LiveSourceHandle = {
  source: FrameSource;
  /** The live preview. Rendered only while a session is running. */
  preview: ReactNode;
  /** True once the source can take frames. */
  ready: boolean;
  /** "granted", "ask" (can still ask) or "blocked" (the person must use Settings). */
  access: "granted" | "ask" | "blocked";
  requestAccess: () => void;
  openSettings: () => void;
  error?: string | null;
};

type FrameCard = {
  id: string;
  uri: string;
  takenAt: number;
  kind: "auto" | "manual";
  itemId: string;
  status: "analyzing" | "done" | "skipped" | "error";
  notes: LiveNote[];
  tip: string | null;
  error?: string;
  evidenceId?: string;
  saving?: boolean;
  findings: string[];
};

/** One piece of narration: its audio (until it is uploaded), its transcript, and what the person did with it. */
type SegmentCard = {
  id: string;
  startedAt: number;
  endedAt: number;
  itemId: string;
  audioUri: string | null;
  storageKey?: string;
  audioEvidenceId?: string;
  status: "uploading" | "transcribing" | "done" | "error";
  transcript: string;
  confirmed: boolean;
  error?: string;
  noteSaved?: boolean;
  findingAdded?: boolean;
  busy?: boolean;
};

const MAX_CARDS = 12;
/** Pieces shorter than this are a tap, not speech. */
const MIN_PIECE_MS = 1500;
const JSON_HEADERS = { "Content-Type": "application/json" };
const CONFIDENCE_TONE = { low: "neutral", medium: "info", high: "accent" } as const;

/**
 * Beta live session: a camera preview, and a still every few seconds (or on tap) goes to the AI for a suggestion that
 * the person reviews. Nothing is recorded. Frames are temporary files that are deleted unless the person saves them.
 * The rules live in @eval-ai/shared (liveSession.ts); this component only drives them with a clock and the app lifecycle.
 */
export function LiveSession({
  assessmentId,
  items,
  initialStatuses = {},
  startHereId = null,
  handle,
  narration,
  onOpenJob,
  onPrepareReport,
  markStatus = setItemStatus,
}: {
  assessmentId: string;
  /** The job's checklist, with what to look for. The session walks it (D-023). */
  items: WalkItem[];
  initialStatuses?: WalkStatuses;
  startHereId?: string | null;
  handle: LiveSourceHandle;
  narration: NarrationHandle;
  onOpenJob?: () => void;
  onPrepareReport?: () => void;
  /** Saves a status. Called only from a person's tap on a status chip. */
  markStatus?: (assessmentId: string, itemId: string, status: ItemStatus) => Promise<void>;
}) {
  const { canWrite, loaded } = useRole();
  const [state, dispatch] = useReducer(liveReducer, LIVE_INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [cards, setCards] = useState<FrameCard[]>([]);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  // The walk (D-023): the current checklist item. Pictures, narration and AI notes are linked to it automatically.
  const [statuses, setStatuses] = useState<WalkStatuses>(initialStatuses);
  const [index, setIndex] = useState(() => startIndex(items, initialStatuses, startHereId));
  const current = index >= 0 ? items[index] : undefined;
  const itemId = current?.id ?? "";
  const itemRef = useRef(itemId);
  itemRef.current = itemId;
  const [lookForOpen, setLookForOpen] = useState(true);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [hint, setHint] = useState<{ itemId: string; seen: string[]; still: string[] } | null>(null);
  const [counts, setCounts] = useState<{ pictures: Record<string, number>; pieces: Record<string, number> }>({ pictures: {}, pieces: {} });
  const [markError, setMarkError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const capturing = useRef(false);
  const captureFailures = useRef(0);
  const [segments, setSegments] = useState<SegmentCard[]>([]);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const narrationRef = useRef(narration);
  narrationRef.current = narration;
  // The checklist item the person was on when the current piece started.
  const pieceItem = useRef("");
  // Pieces are uploaded and transcribed one at a time, in order.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [narrationNote, setNarrationNote] = useState<string | null>(null);

  const patch = useCallback((id: string, change: Partial<FrameCard>) => setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...change } : c))), []);

  // The clock: one tick per second while running.
  useEffect(() => {
    if (state.status !== "running") return;
    const t = setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => clearInterval(t);
  }, [state.status]);

  // Keep the screen on only while a session runs.
  useEffect(() => {
    if (state.status !== "running") return;
    void activateKeepAwakeAsync("live-session");
    return () => {
      void deactivateKeepAwake("live-session");
    };
  }, [state.status]);

  // No background capture: leaving the app ends the session.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active" && stateRef.current.status === "running") dispatch({ type: "stop", reason: "background" });
    });
    return () => sub.remove();
  }, []);

  // Leaving the screen deletes every temporary frame that wasn't saved as evidence.
  useEffect(
    () => () => {
      dispatch({ type: "stop", reason: "user" });
      cardsRef.current.forEach((c) => discardFile(c.uri));
      segmentsRef.current.forEach((c) => discardFile(c.audioUri)); // only pieces that never uploaded still have a phone copy
    },
    [],
  );

  async function analyzeFrame(id: string, base64: string) {
    dispatch({ type: "analysis_started" });
    const previousNotes = cardsRef.current.flatMap((c) => c.notes.map((n) => n.text)).slice(0, 3);
    const forItem = itemRef.current;
    try {
      const res = await apiFetch("/api/ai/live-frame", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ assessmentId, imageBase64: base64, mimeType: "image/jpeg", currentItemId: itemRef.current || undefined, previousNotes }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<LiveFrameResult> & { error?: string; code?: string };
      if (!res.ok) {
        const message = data.error ?? "The AI couldn't look at that frame.";
        dispatch({ type: "analysis_failed", kind: classifyLiveFailure(res.status, data.code), message });
        patch(id, { status: "error", error: message });
        return;
      }
      dispatch({ type: "analysis_ok" });
      patch(id, { status: "done", notes: data.notes ?? [], tip: data.betterShotTip ?? null });
      // A hint about the item's look-for text: only shown for the item the picture was taken for, and only a suggestion.
      if (forItem && ((data.seen?.length ?? 0) > 0 || (data.stillToShow?.length ?? 0) > 0)) setHint({ itemId: forItem, seen: data.seen ?? [], still: data.stillToShow ?? [] });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      dispatch({ type: "analysis_failed", kind: "temporary", message });
      patch(id, { status: "error", error: message });
    }
  }

  const capture = useCallback(
    async (kind: "auto" | "manual") => {
      if (capturing.current || stateRef.current.status !== "running") return;
      capturing.current = true;
      try {
        const frame = await handle.source.captureFrame();
        captureFailures.current = 0;
        setCaptureError(null);
        if (stateRef.current.status !== "running") {
          discardFile(frame.uri); // the session ended while the picture was being taken
          return;
        }
        dispatch({ type: "frame_taken" });
        setCounts((c) => ({ ...c, pictures: { ...c.pictures, [itemRef.current]: (c.pictures[itemRef.current] ?? 0) + 1 } }));
        const id = `${frame.takenAt}-${Math.random().toString(36).slice(2, 7)}`;
        const s = stateRef.current;
        const analyze = shouldAnalyze(s);
        const card: FrameCard = { id, uri: frame.uri, takenAt: frame.takenAt, kind, itemId: itemRef.current, status: analyze ? "analyzing" : "skipped", notes: [], tip: null, findings: [] };
        setCards((prev) => {
          const next = [card, ...prev];
          next.slice(MAX_CARDS).forEach((c) => discardFile(c.uri));
          return next.slice(0, MAX_CARDS);
        });
        if (analyze) void analyzeFrame(id, frame.base64);
      } catch (e) {
        captureFailures.current += 1;
        setCaptureError(e instanceof Error ? e.message : String(e));
        if (captureFailures.current >= 3) dispatch({ type: "stop", reason: "camera_error" });
      } finally {
        capturing.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handle.source, assessmentId],
  );

  const patchSeg = useCallback((id: string, change: Partial<SegmentCard>) => setSegments((prev) => prev.map((c) => (c.id === id ? { ...c, ...change } : c))), []);

  /** Upload a piece (once) and transcribe it. Safe to run again for Retry. */
  async function processSegment(id: string) {
    const seg = segmentsRef.current.find((c) => c.id === id);
    if (!seg) return;
    try {
      let key = seg.storageKey;
      if (!key) {
        if (!seg.audioUri) throw new Error("The recording is no longer on this phone.");
        patchSeg(id, { status: "uploading", error: undefined });
        const up = await uploadEvidence({ assessmentId, itemId: seg.itemId || undefined, uri: seg.audioUri, fileName: `live-narration-${seg.startedAt}.m4a`, mimeType: "audio/mp4" });
        key = up.storageKey;
        patchSeg(id, { storageKey: key, audioEvidenceId: up.id, audioUri: null });
        discardFile(seg.audioUri); // kept privately with the job now; the phone copy isn't needed
      }
      patchSeg(id, { status: "transcribing", error: undefined });
      const res = await apiFetch("/api/ai/transcribe", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ assessmentId, storageKey: key }) });
      const data = (await res.json().catch(() => ({}))) as { transcript?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Transcription unavailable");
      patchSeg(id, { status: "done", transcript: data.transcript ?? "", confirmed: false });
    } catch (e) {
      patchSeg(id, { status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  function enqueueSegment(id: string) {
    queue.current = queue.current.then(() => processSegment(id)).catch(() => {});
  }

  /** A finished piece of audio becomes a card, then goes through the upload and transcription queue. */
  function acceptPiece(piece: NarrationPiece | null, itemAtStart: string) {
    if (!piece) return;
    if (piece.endedAt - piece.startedAt < MIN_PIECE_MS) {
      discardFile(piece.uri);
      return;
    }
    setCounts((c) => ({ ...c, pieces: { ...c.pieces, [itemAtStart]: (c.pieces[itemAtStart] ?? 0) + 1 } }));
    const id = `seg-${piece.startedAt}-${Math.random().toString(36).slice(2, 6)}`;
    const card: SegmentCard = { id, startedAt: piece.startedAt, endedAt: piece.endedAt, itemId: itemAtStart, audioUri: piece.uri, status: "uploading", transcript: "", confirmed: false };
    segmentsRef.current = [card, ...segmentsRef.current];
    setSegments((prev) => [card, ...prev]);
    enqueueSegment(id);
  }

  // The microphone follows the session: on when a session that narrates starts running, off whenever it stops.
  const wasRunning = useRef(false);
  useEffect(() => {
    const isRunning = state.status === "running";
    if (isRunning && !wasRunning.current) {
      pieceItem.current = itemRef.current;
      setNarrationNote(null);
      if (stateRef.current.narrationOn) {
        void narrationRef.current.start().then((ok) => {
          if (!ok) setNarrationNote("Narration is off for this session, so only pictures are taken.");
        });
      }
    }
    if (!isRunning && wasRunning.current) {
      const itemAtStart = pieceItem.current;
      void narrationRef.current.stop().then((piece) => acceptPiece(piece, itemAtStart));
    }
    wasRunning.current = isRunning;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  // Close a piece every LIVE_SEGMENT_SECONDS: it goes off to be transcribed while the next one starts.
  useEffect(() => {
    if (!shouldCloseSegment(stateRef.current) || !narrationRef.current.active) return;
    const itemAtStart = pieceItem.current;
    pieceItem.current = itemRef.current;
    dispatch({ type: "segment_closed" });
    void narrationRef.current.rotate().then((piece) => acceptPiece(piece, itemAtStart));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.elapsedS]);

  // Automatic frame on the interval (only while the AI is on and idle; see shouldAutoCapture).
  useEffect(() => {
    if (shouldAutoCapture(stateRef.current)) void capture("auto");
  }, [state.elapsedS, capture]);

  async function saveFrame(card: FrameCard): Promise<string | null> {
    if (card.evidenceId) return card.evidenceId;
    patch(card.id, { saving: true });
    try {
      const up = await uploadEvidence({ assessmentId, itemId: card.itemId || undefined, uri: card.uri, fileName: `live-${card.takenAt}.jpg`, mimeType: "image/jpeg" });
      patch(card.id, { evidenceId: up.id, saving: false });
      return up.id;
    } catch (e) {
      patch(card.id, { saving: false });
      Alert.alert("Couldn't save the frame", e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  async function addFinding(card: FrameCard, note: LiveNote) {
    const evidenceId = await saveFrame(card); // a finding always keeps its picture
    if (!evidenceId) return;
    try {
      const res = await apiFetch("/api/findings", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ assessmentId, title: note.text.slice(0, 120), description: note.text, evidenceRefs: [evidenceId] }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save the finding");
      patch(card.id, { findings: [...cardsRef.current.find((c) => c.id === card.id)!.findings, note.id] });
    } catch (e) {
      Alert.alert("Couldn't add the finding", e instanceof Error ? e.message : String(e));
    }
  }

  const linkedFrames = (seg: SegmentCard): FrameCard[] => {
    const links = linkFramesToSegments(segmentsRef.current.map((c) => ({ id: c.id, startedAt: c.startedAt, endedAt: c.endedAt })), cardsRef.current.map((c) => ({ id: c.id, takenAt: c.takenAt })));
    return (links[seg.id] ?? []).map((fid) => cardsRef.current.find((c) => c.id === fid)).filter((c): c is FrameCard => !!c);
  };

  async function addNarrationNote(seg: SegmentCard) {
    if (!seg.itemId) {
      Alert.alert("Choose an item", "Pick the checklist item this narration belongs to, then try again.");
      return;
    }
    patchSeg(seg.id, { busy: true });
    try {
      await appendItemNote(assessmentId, seg.itemId, narrationNoteLine(seg.transcript, new Date(seg.startedAt)));
      patchSeg(seg.id, { noteSaved: true, busy: false });
    } catch (e) {
      patchSeg(seg.id, { busy: false });
      Alert.alert("Couldn't save the note", e instanceof Error ? e.message : String(e));
    }
  }

  async function addNarrationFinding(seg: SegmentCard) {
    patchSeg(seg.id, { busy: true });
    try {
      const refs: string[] = seg.audioEvidenceId ? [seg.audioEvidenceId] : [];
      for (const frame of linkedFrames(seg)) {
        const id = await saveFrame(frame); // pictures taken while this was said stay with the finding
        if (id) refs.push(id);
      }
      const text = seg.transcript.trim();
      const res = await apiFetch("/api/findings", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ assessmentId, title: text.slice(0, 120), description: text, evidenceRefs: refs }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save the finding");
      patchSeg(seg.id, { findingAdded: true, busy: false });
    } catch (e) {
      patchSeg(seg.id, { busy: false });
      Alert.alert("Couldn't add the finding", e instanceof Error ? e.message : String(e));
    }
  }

  function dismiss(card: FrameCard) {
    discardFile(card.uri);
    setCards((prev) => prev.filter((c) => c.id !== card.id));
  }

  /** Move to another item. The narration piece in progress is cut here, so each piece belongs to exactly one item. */
  function goTo(next: number) {
    if (next < 0 || next >= items.length || next === index) return;
    const nextId = items[next].id;
    if (stateRef.current.status === "running" && narrationRef.current.active) {
      const itemAtStart = pieceItem.current;
      pieceItem.current = nextId;
      void narrationRef.current.rotate().then((piece) => acceptPiece(piece, itemAtStart));
    } else {
      pieceItem.current = nextId;
    }
    setIndex(next);
    setJumpOpen(false);
    setMarkError(null);
  }

  /** Mark the current item. Only ever called from a person's tap on a status chip; Next never marks anything. */
  async function markItem(status: ItemStatus) {
    if (!current || viewOnly) return;
    const id = current.id;
    const before = statuses[id];
    setMarkError(null);
    setStatuses((m) => ({ ...m, [id]: status }));
    setMarking(true);
    try {
      await markStatus(assessmentId, id, status);
    } catch (e) {
      setStatuses((m) => ({ ...m, [id]: before }));
      setMarkError(e instanceof Error ? e.message : String(e));
    } finally {
      setMarking(false);
    }
  }

  const progress = walkProgress(items, statuses);
  const summary = summarizeWalk({ items, statuses, picturesByItem: counts.pictures, piecesByItem: counts.pieces });
  const itemTitle = (id: string | null) => (id ? items.find((i) => i.id === id)?.title ?? null : null);
  const running = state.status === "running";
  const viewOnly = loaded && !canWrite;

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Text variant="title" style={{ flex: 1 }}>Live session</Text>
        <Badge label="Beta" tone="warning" />
      </View>
      <Text variant="caption">A camera preview with a still picture every few seconds. Talk through what you see: your voice is recorded in short pieces and turned into notes you review. Video is never recorded.</Text>

      {viewOnly ? <Banner tone="neutral" message="You have view-only access. Live sessions are for members, admins and owners." /> : null}

      {state.status === "stopped" ? <Banner tone="neutral" title="Session ended" message={liveStopMessage(state.stopReason)} /> : null}

      {state.status === "stopped" && items.length > 0 && (state.framesCaptured > 0 || segments.length > 0 || progress.marked > 0) ? (
        <Card>
          <SectionHeader title="Walk summary" subtitle={`${progress.marked} of ${progress.total} items marked`} />
          {summary.rows.map((r) => (
            <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Text variant="body" style={{ flex: 1 }} numberOfLines={2}>{r.title}</Text>
              <Text variant="caption">{r.pictures}📷 {r.pieces}🎙</Text>
              <Badge label={checkStatus(r.status).label} tone={checkStatus(r.status).tone} />
            </View>
          ))}
          {summary.extraPictures + summary.extraPieces > 0 ? <Text variant="caption">{summary.extraPictures} picture(s) and {summary.extraPieces} narration piece(s) were not tied to an item.</Text> : null}
          {summary.unmarked.length > 0 ? <Banner tone="neutral" title={`${summary.unmarked.length} not marked yet`} message="They stay Not checked until you mark them. Nothing was marked for you." /> : null}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {onOpenJob ? <Button title="Back to the job" variant="secondary" onPress={onOpenJob} style={{ flex: 1 }} /> : null}
            {onPrepareReport ? <Button title="Prepare my report" icon="document-text-outline" variant="accent" onPress={onPrepareReport} style={{ flex: 1 }} /> : null}
          </View>
        </Card>
      ) : null}

      {state.status === "idle" || state.status === "stopped" ? (
        <Card>
          {current ? <Text variant="caption">The walk starts at: {current.title}</Text> : null}
          <OptionChips
            narrationOn={state.narrationOn}
            aiEnabled={state.aiEnabled}
            onNarration={(on) => dispatch({ type: "set_narration", on })}
            onAi={(on) => dispatch({ type: "set_ai", on })}
          />
          <IntervalChips value={state.intervalS} onChange={(seconds) => dispatch({ type: "set_interval", seconds })} />
          {handle.access === "granted" ? (
            <Button title={state.status === "stopped" ? "Start again" : "Start live session"} icon="videocam" variant="accent" size="lg" onPress={() => dispatch({ type: "open" })} disabled={viewOnly} />
          ) : handle.access === "ask" ? (
            <Button title="Allow camera" icon="camera-outline" variant="accent" size="lg" onPress={handle.requestAccess} />
          ) : (
            <>
              <Banner tone="warning" message="Camera access is turned off. Turn it on in Settings to use the live session." />
              <Button title="Open Settings" icon="settings-outline" variant="secondary" onPress={handle.openSettings} />
            </>
          )}
          <Text variant="caption" color={colors.textSubtle}>Limits: {LIVE_MAX_SECONDS / 60} minutes or {LIVE_MAX_FRAMES} pictures per session.</Text>
        </Card>
      ) : null}

      {state.status === "consent" ? (
        <Card>
          <Text variant="heading">Before you start</Text>
          <Text variant="body">While this session runs, the camera shows a preview and a still picture is taken every {state.intervalS} seconds, or when you tap Capture. Video is never recorded. Pictures are not kept unless you save them.</Text>
          {state.narrationOn ? (
            <Text variant="body">The microphone records your voice in short pieces while the session runs. Each piece is sent to the speech service to be turned into text, and the audio is saved privately with this job. Transcripts are drafts: you check and confirm them.</Text>
          ) : (
            <Text variant="body">The microphone stays off. Only pictures are taken.</Text>
          )}
          {state.aiEnabled ? <Text variant="body">Pictures are also sent to the AI service for suggestions. AI notes are suggestions: you decide what is true.</Text> : null}
          <Text variant="body">Tell people on site you're taking pictures{state.narrationOn ? " and recording audio" : ""}, and don't capture anyone who hasn't agreed. Other people's voices may be picked up.</Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title="Cancel" variant="secondary" onPress={() => dispatch({ type: "decline" })} style={{ flex: 1 }} />
            <Button title="I understand, start" icon="checkmark" variant="accent" onPress={() => dispatch({ type: "accept" })} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}

      {running ? (
        <>
          {current ? (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Text variant="overline" style={{ flex: 1 }}>Now · item {index + 1} of {items.length} · {progress.marked} marked</Text>
                {statuses[current.id] && statuses[current.id] !== "not_checked" ? <Badge label={checkStatus(statuses[current.id]!).label} tone={checkStatus(statuses[current.id]!).tone} /> : null}
              </View>
              <Text variant="heading">{current.title}</Text>
              {current.instructions ? (
                <>
                  <Pressable onPress={() => setLookForOpen((v) => !v)} accessibilityRole="button" accessibilityLabel={lookForOpen ? "Hide what to look for" : "Show what to look for"}>
                    <Text variant="label" color={colors.accentText}>{lookForOpen ? "Look for ▾" : "Look for ▸"}</Text>
                  </Pressable>
                  {lookForOpen ? <Text variant="body">{current.instructions}</Text> : null}
                </>
              ) : null}
              {hint && hint.itemId === current.id ? (
                <View style={{ gap: 2 }}>
                  {hint.seen.length > 0 ? <Text variant="caption" color={colors.success}>Seen (AI suggestion): {hint.seen.join(", ")}</Text> : null}
                  {hint.still.length > 0 ? <Text variant="caption" color={colors.warning}>Still to show (AI suggestion): {hint.still.join(", ")}</Text> : null}
                </View>
              ) : null}
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {CHECK_STATUSES.map((st) => (
                  <Chip key={st.value} label={st.label} icon={st.icon} tone={st.tone} active={(statuses[current.id] ?? "not_checked") === st.value} onPress={() => void markItem(st.value)} />
                ))}
              </View>
              {marking ? <Text variant="caption">Saving…</Text> : null}
              {markError ? <Banner tone="danger" message={markError} /> : null}
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <Button title="Back" icon="chevron-back" variant="secondary" size="sm" onPress={() => goTo(stepIndex(items.length, index, -1))} disabled={index <= 0} style={{ flex: 1 }} />
                <Button title="Jump to…" icon="list-outline" variant="ghost" size="sm" onPress={() => setJumpOpen((v) => !v)} style={{ flex: 1 }} />
                <Button title="Next" icon="chevron-forward" variant="accent" size="sm" onPress={() => goTo(stepIndex(items.length, index, 1))} disabled={index >= items.length - 1} style={{ flex: 1 }} />
              </View>
              {jumpOpen ? <ItemChips label="Go to item" items={items} value={itemId} onChange={(id) => goTo(items.findIndex((i) => i.id === id))} allowNone={false} /> : null}
            </Card>
          ) : null}
          <View style={{ height: 340, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.heroBg }}>
            {handle.preview}
            <View style={{ position: "absolute", top: space.sm, left: space.sm, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(15,23,42,0.78)", paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.pill }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger }} />
              <Text style={{ fontSize: 12, fontWeight: "800", color: colors.textOnDark }}>{liveIndicator(state, narration.active)}</Text>
            </View>
            <View style={{ position: "absolute", top: space.sm, right: space.sm, backgroundColor: "rgba(15,23,42,0.78)", paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.pill }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textOnDark }}>{formatElapsed(state.elapsedS)} · {state.framesCaptured}/{LIVE_MAX_FRAMES}</Text>
            </View>
          </View>

          {handle.error ? <Banner tone="danger" message={handle.error} /> : null}
          {captureError ? <Banner tone="warning" message={`${captureError} It will stop if the camera keeps failing.`} /> : null}
          {narrationNote ?? narration.error ? <Banner tone="warning" message={narrationNote ?? narration.error ?? ""} /> : null}
          {state.narrationOn && narration.active ? <Text variant="caption">Narrating — a new piece is saved and transcribed about every {LIVE_SEGMENT_SECONDS} seconds.</Text> : null}
          {state.aiEnabled && state.aiMode === "paused" ? (
            <Banner tone="warning" title="AI paused" message={state.aiMessage ?? "The AI had trouble. Pictures can still be captured."} action={<Button title="Retry AI" icon="refresh" size="sm" variant="secondary" onPress={() => dispatch({ type: "resume_ai" })} />} />
          ) : null}
          {state.aiEnabled && state.aiMode === "off" ? <Banner tone="neutral" title="Capture only" message={`${state.aiMessage ?? "The AI isn't available."} You can still capture and save pictures.`} /> : null}
          {state.aiEnabled && state.aiMode === "on" && state.aiMessage ? <Banner tone="warning" message={`${state.aiMessage} Trying again on the next picture.`} /> : null}

          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title="Capture" icon="camera" variant="accent" onPress={() => void capture("manual")} disabled={!handle.ready} style={{ flex: 1 }} />
            <Button title="Stop" icon="stop" variant="danger" onPress={() => dispatch({ type: "stop", reason: "user" })} style={{ flex: 1 }} />
          </View>
          <IntervalChips value={state.intervalS} onChange={(seconds) => dispatch({ type: "set_interval", seconds })} />
          <Text variant="caption">
            {state.aiEnabled
              ? state.aiMode === "on"
                ? `A picture is taken and sent to the AI every ${state.intervalS} seconds. ${state.framesAnalyzed} answered.`
                : "The AI is not looking right now. Pictures are still taken."
              : `A picture is taken every ${state.intervalS} seconds. The AI is not looking (turn on "AI second pair of eyes" before starting).`}
          </Text>
        </>
      ) : null}

      {segments.length > 0 ? <Text variant="overline" style={{ marginTop: space.sm }}>Your narration</Text> : null}
      {segments.map((seg) => {
        const pics = linkedFrames(seg);
        const claims = findNumberClaims(seg.transcript).filter((p) => p.check);
        const canUse = seg.status === "done" && seg.confirmed && seg.transcript.trim().length >= 2;
        return (
          <Card key={seg.id}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text variant="caption" style={{ flex: 1 }}>{new Date(seg.startedAt).toLocaleTimeString()} – {new Date(seg.endedAt).toLocaleTimeString()}</Text>
              {seg.status === "done" ? <Badge label={seg.confirmed ? "Confirmed" : "Check before confirming"} tone={seg.confirmed ? "success" : "warning"} /> : null}
            </View>
            {seg.status === "uploading" ? <Text variant="caption">Saving the recording…</Text> : null}
            {seg.status === "transcribing" ? <Text variant="caption">Turning your voice into text…</Text> : null}
            {seg.status === "error" ? (
              <Banner
                tone="warning"
                message={`${seg.error ?? "Couldn't transcribe this piece."} ${seg.storageKey ? "Your audio is saved." : "Your audio is still on this phone until you leave this screen."}`}
                action={<Button title="Retry" icon="refresh" size="sm" variant="secondary" onPress={() => enqueueSegment(seg.id)} />}
              />
            ) : null}
            {pics.length > 0 ? (
              <View style={{ flexDirection: "row", gap: 6 }}>
                {pics.slice(0, 4).map((p) => (
                  <Image key={p.id} source={{ uri: p.uri }} style={{ width: 44, height: 58, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted }} />
                ))}
              </View>
            ) : null}
            {seg.status === "done" ? (
              <>
                <Field value={seg.transcript} onChangeText={(t) => patchSeg(seg.id, { transcript: t, confirmed: false, noteSaved: false })} multiline />
                {claims.length > 0 ? (
                  <View style={{ gap: 4 }}>
                    <Text variant="caption">Check these numbers and units — speech can be misheard:</Text>
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                      {claims.map((c, i) => (
                        <Badge key={i} label={c.text.trim()} tone="warning" />
                      ))}
                    </View>
                  </View>
                ) : null}
                <ItemChips label="Checklist item for this note" items={items} value={seg.itemId} onChange={(v) => patchSeg(seg.id, { itemId: v })} />
                <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                  {!seg.confirmed ? <Button title="Confirm" icon="checkmark" size="sm" onPress={() => patchSeg(seg.id, { confirmed: true })} /> : null}
                  {seg.noteSaved ? (
                    <Badge label="Added as a note" tone="success" />
                  ) : (
                    <Button title="Add as note on the item" icon="document-text-outline" size="sm" variant="secondary" disabled={!canUse || viewOnly} loading={seg.busy} onPress={() => void addNarrationNote(seg)} />
                  )}
                  {seg.findingAdded ? (
                    <Badge label="Added as a finding draft" tone="success" />
                  ) : (
                    <Button title="Add as finding draft" icon="flag-outline" size="sm" variant="secondary" disabled={!canUse || viewOnly} loading={seg.busy} onPress={() => void addNarrationFinding(seg)} />
                  )}
                </View>
                {!seg.confirmed ? <Text variant="caption">Confirm the text first. What you said never changes a checklist answer.</Text> : null}
              </>
            ) : null}
          </Card>
        );
      })}

      {cards.length > 0 ? <Text variant="overline" style={{ marginTop: space.sm }}>Pictures and notes</Text> : null}
      {cards.map((card) => (
        <Card key={card.id}>
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Image source={{ uri: card.uri }} style={{ width: 84, height: 112, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted }} />
            <View style={{ flex: 1, gap: space.xs }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Text variant="caption">{new Date(card.takenAt).toLocaleTimeString()} · {card.kind === "auto" ? "automatic" : "you captured"}</Text>
                {card.evidenceId ? <Badge label="Saved as evidence" tone="success" /> : null}
              </View>
              {itemTitle(card.itemId) ? <Text variant="caption" color={colors.textMuted} numberOfLines={1}>Item: {itemTitle(card.itemId)}</Text> : null}
              {card.status === "analyzing" ? <Text variant="caption">The AI is looking…</Text> : null}
              {card.status === "skipped" ? <Text variant="caption">Captured without AI.</Text> : null}
              {card.status === "error" ? <Text variant="caption" color={colors.danger}>{card.error}</Text> : null}
              {card.status === "done" && card.notes.length === 0 ? <Text variant="caption">The AI had nothing new to add.</Text> : null}
            </View>
          </View>

          {card.tip ? <Banner tone="neutral" message={`Tip: ${card.tip}`} /> : null}

          {card.notes.map((note) => (
            <View key={note.id} style={{ gap: space.xs, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.divider }}>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <Badge label="AI suggestion · needs your review" tone="warning" />
                <Badge label={`${note.confidence} confidence`} tone={CONFIDENCE_TONE[note.confidence]} />
              </View>
              <Text variant="body">{note.text}</Text>
              {itemTitle(note.checklistItemId) ? <Text variant="caption">Related item: {itemTitle(note.checklistItemId)}</Text> : null}
              <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                {card.findings.includes(note.id) ? (
                  <Badge label="Added as a finding draft" tone="success" />
                ) : (
                  <Button title="Add as finding draft" icon="flag-outline" size="sm" variant="secondary" onPress={() => void addFinding(card, note)} loading={card.saving} disabled={viewOnly} />
                )}
              </View>
            </View>
          ))}

          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            {!card.evidenceId ? <Button title="Save picture as evidence" icon="save-outline" size="sm" variant="secondary" onPress={() => void saveFrame(card)} loading={card.saving} disabled={viewOnly} /> : null}
            <Button title="Dismiss" size="sm" variant="ghost" onPress={() => dismiss(card)} />
          </View>
        </Card>
      ))}
      {cards.length > 0 ? <Text variant="caption" color={colors.textSubtle}>Pictures you don't save are deleted when you leave this screen.</Text> : null}
    </>
  );
}

function OptionChips({ narrationOn, aiEnabled, onNarration, onAi }: { narrationOn: boolean; aiEnabled: boolean; onNarration: (on: boolean) => void; onAi: (on: boolean) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label" color={colors.text}>Options</Text>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        <Chip label={narrationOn ? "Narrate: on" : "Narrate: off"} icon="mic-outline" tone="accent" active={narrationOn} onPress={() => onNarration(!narrationOn)} />
        <Chip label={aiEnabled ? "AI second pair of eyes: on" : "AI second pair of eyes: off"} icon="eye-outline" tone="accent" active={aiEnabled} onPress={() => onAi(!aiEnabled)} />
      </View>
    </View>
  );
}

function IntervalChips({ value, onChange }: { value: number; onChange: (seconds: number) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label" color={colors.text}>How often a picture is taken</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {LIVE_INTERVALS_S.map((s) => (
          <Chip key={s} label={`${s} s`} icon="time-outline" tone="accent" active={value === s} onPress={() => onChange(s)} />
        ))}
      </View>
    </View>
  );
}

