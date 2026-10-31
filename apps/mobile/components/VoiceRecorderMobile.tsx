import { useEffect, useRef, useState } from "react";
import { View, Alert } from "react-native";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { apiFetch, apiBase } from "../lib/api";
import { uploadEvidence } from "../lib/upload";
import { colors, radius, space } from "../lib/theme";
import { Badge, Banner, Button, Field, IconButton, Loading, Text } from "./ui";

type PermState = "unknown" | "granted" | "denied" | "unsupported";

export function VoiceRecorderMobile({ assessmentId, itemId, onTranscript }: { assessmentId?: string; itemId?: string; onTranscript?: (t: string, audioUri?: string) => void }) {
  const [perm, setPerm] = useState<PermState>("unknown");
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startAtRef = useRef<number>(0);

  // The recorder itself is released by useAudioRecorder on unmount.
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  async function checkPerm(): Promise<PermState> {
    try {
      const { status } = await requestRecordingPermissionsAsync();
      if (status === "granted") return "granted";
      if (status === "denied") return "denied";
      return "unknown";
    } catch {
      return "unsupported";
    }
  }

  async function start() {
    setError(null);
    setConfirmed(false);
    setTranscript("");
    setAudioUri(null);
    const p = await checkPerm();
    setPerm(p);
    if (p !== "granted") {
      if (p === "denied") setError("Microphone access is off — turn it on in Settings.");
      else if (p === "unsupported") setError("Recording isn't supported on this device.");
      else setError("Allow microphone access when asked to record.");
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      startAtRef.current = Date.now();
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(Math.floor((Date.now() - startAtRef.current) / 1000)), 200);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function stop() {
    if (!recording) return;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      setAudioUri(uri ?? null);
      setRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (!uri) return;
      try {
        apiBase();
      } catch {
        setError("Transcription isn't available right now. Your recording is kept on this phone.");
        return;
      }
      // Keep the original audio privately (linked to the job/item), then transcribe it by reference —
      // the server converts m4a to WAV, so no large base64 body is sent from the phone.
      let savedKey: string | null = null;
      try {
        if (assessmentId) savedKey = (await uploadEvidence({ assessmentId, itemId, uri, fileName: "voice-" + Date.now() + ".m4a", mimeType: "audio/mp4" })).storageKey ?? null;
      } catch {
        /* upload failed — fall back to sending the clip inline below if it is small */
      }
      setTranscribing(true);
      try {
        let payload: Record<string, unknown>;
        if (savedKey && assessmentId) {
          payload = { assessmentId, storageKey: savedKey };
        } else {
          const blob = await (await fetch(uri)).blob();
          if (blob.size > 3_500_000) throw new Error("This recording is too long to transcribe without saving it. Check your connection and record again, or type the note.");
          const base64 = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => {
              const str = String(r.result);
              resolve(str.includes(",") ? str.split(",")[1] : str);
            };
            r.onerror = () => reject(new Error("read failed"));
            r.readAsDataURL(blob);
          });
          payload = { assessmentId, audioBase64: base64 };
        }
        const tr = await apiFetch("/api/ai/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await tr.json().catch(() => ({}));
        if (!tr.ok) throw new Error((data as { error?: string }).error ?? "Transcription unavailable");
        const t = (data as { transcript?: string }).transcript ?? "";
        setTranscript(t);
        setConfirmed(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setTranscribing(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function cancel() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recording) recorder.stop().catch(() => {});
    setRecording(false);
    setTranscript("");
    setConfirmed(false);
    setAudioUri(null);
    setError(null);
  }

  const isRecording = recording;
  const canAttach = confirmed && transcript.trim().length >= 2;

  return (
    <View style={{ gap: space.md }}>
      {!isRecording ? (
        <Button title="Record" icon="mic" onPress={start} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 10 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger }} />
            <Text variant="bodyStrong" color={colors.danger}>Recording · {duration}s</Text>
          </View>
          <Button title="Stop" icon="stop" variant="accent" onPress={stop} />
          <IconButton icon="close" label="Cancel recording" onPress={cancel} />
        </View>
      )}
      <Text style={{ fontSize: 11, color: colors.textSubtle }}>The microphone is only used while you're recording.</Text>

      {perm === "denied" ? <Banner tone="warning" message="Microphone access is off — turn it on in Settings, or type your note below." /> : null}
      {transcribing ? <Loading label="Transcribing… you can edit it afterwards." /> : null}

      {transcript ? (
        <View style={{ gap: space.sm, backgroundColor: confirmed ? colors.successSoft : colors.warningSoft, borderRadius: radius.sm, padding: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text variant="label" color={colors.text} style={{ flex: 1 }}>Transcript</Text>
            <Badge label={confirmed ? "Confirmed" : "Check before confirming"} tone={confirmed ? "success" : "warning"} />
          </View>
          <Field value={transcript} onChangeText={(t) => { setTranscript(t); setConfirmed(false); }} multiline />
          <Text variant="caption">Check numbers and units carefully — speech can be misheard.</Text>
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            {!confirmed ? <Button title="Confirm" icon="checkmark" size="sm" onPress={() => setConfirmed(true)} /> : null}
            <Button
              title={`Attach to ${itemId ? "item" : "job"}`}
              icon="attach"
              variant="accent"
              size="sm"
              disabled={!canAttach}
              onPress={() => { if (!canAttach) { Alert.alert("Confirm first", "Check and confirm the transcript before attaching it."); return; } onTranscript?.(transcript, audioUri ?? undefined); }}
            />
            <Button title="Discard" variant="ghost" size="sm" onPress={() => { setTranscript(""); setConfirmed(false); }} />
          </View>
        </View>
      ) : null}

      {audioUri && !transcript && !transcribing ? <Text variant="caption">Your recording is kept on this phone.</Text> : null}
      {error ? <Banner tone="danger" message={`${error} You can type your note below instead.`} /> : null}

      <Field
        label="Or type a note"
        placeholder="Type your observation if recording isn't working"
        multiline
        onEndEditing={(e) => { const t = e.nativeEvent.text; if (t) { setTranscript(t); setConfirmed(false); } }}
      />
    </View>
  );
}
