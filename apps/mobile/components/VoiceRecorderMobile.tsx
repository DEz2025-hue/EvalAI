import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, Alert } from "react-native";
import { Audio } from "expo-av";
import { apiFetch, apiBase } from "../lib/api";

type PermState = "unknown" | "granted" | "denied" | "unsupported";

export function VoiceRecorderMobile({ assessmentId, itemId, onTranscript }: { assessmentId?: string; itemId?: string; onTranscript?: (t: string, audioUri?: string) => void }) {
  const [perm, setPerm] = useState<PermState>("unknown");
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startAtRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recording?.stopAndUnloadAsync().catch(() => {});
    };
  }, [recording]);

  async function checkPerm(): Promise<PermState> {
    try {
      const { status } = await Audio.requestPermissionsAsync();
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
      if (p === "denied") setError("Microphone permission denied — enable in Settings, or type below.");
      else if (p === "unsupported") setError("Recording not supported on this device — type your observation below.");
      else setError("Microphone permission needed — allow when prompted, or type below.");
      return;
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
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
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setAudioUri(uri ?? null);
      setRecording(null);
      if (timerRef.current) clearInterval(timerRef.current);
      if (!uri) return;
      // Preserve original audio: upload to POST /api/voice/upload (now persisted + linked)
      try {
        apiBase();
        const fd = new FormData();
        // @ts-ignore RN fetch uri
        fd.append("file", { uri, name: `voice-${Date.now()}.m4a`, type: "audio/m4a" } as unknown as Blob);
        if (assessmentId) fd.append("assessmentId", assessmentId);
        if (itemId) fd.append("itemId", itemId);
        await apiFetch("/api/voice/upload", { method: "POST", body: fd as never });
      } catch {}
      // Transcribe: fetch base64
      setTranscribing(true);
      try {
        const resp = await fetch(uri);
        const blob = await resp.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => {
            const s = String(r.result);
            resolve(s.includes(",") ? s.split(",")[1] : s);
          };
          r.onerror = () => reject(new Error("read failed"));
          r.readAsDataURL(blob);
        });
        try {
          apiBase();
        } catch {
          setError("Transcription needs EXPO_PUBLIC_APP_URL set to your web. Original audio preserved locally.");
          return;
        }
        const tr = await apiFetch("/api/ai/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audioBase64: base64, mimeType: "audio/m4a" }) });
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
    recording?.stopAndUnloadAsync().catch(() => {});
    setRecording(null);
    setTranscript("");
    setConfirmed(false);
    setAudioUri(null);
    setError(null);
  }

  const isRecording = !!recording;

  return (
    <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, backgroundColor: "#fff", padding: 12, gap: 10 }}>
      <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>Voice — linked to {itemId ? "item" : assessmentId ? "assessment" : "note"}</Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {!isRecording ? (
          <Pressable onPress={start} style={{ backgroundColor: "#0f172a", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>● Record</Text>
          </Pressable>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fef2f2", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "#fecaca" }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#dc2626" }} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#dc2626" }}>{duration}s recording</Text>
            </View>
            <Pressable onPress={stop} style={{ backgroundColor: "#e0f2fe", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 }}>
              <Text style={{ fontWeight: "700", fontSize: 12, color: "#0369a1" }}>Stop</Text>
            </Pressable>
            <Pressable onPress={cancel} style={{ borderWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 }}>
              <Text style={{ fontSize: 12, color: "#475569" }}>Cancel</Text>
            </Pressable>
          </>
        )}
        <Text style={{ fontSize: 11, color: "#64748b", flex: 1 }}>Mic asked only on Record. No background recording.</Text>
      </View>

      {perm === "denied" ? <View style={{ backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fde68a", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#92400e" }}>Permission denied — enable mic in Settings or type below.</Text></View> : null}

      {transcript ? (
        <View style={{ gap: 8, backgroundColor: confirmed ? "#f0fdf4" : "#fefce8", borderWidth: 1, borderColor: confirmed ? "#bbf7d0" : "#fde68a", borderRadius: 10, padding: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#0f172a" }}>
            Transcript — <Text style={{ color: confirmed ? "#15803d" : "#92400e" }}>{confirmed ? "confirmed" : "unconfirmed until you confirm"}</Text>
          </Text>
          <TextInput value={transcript} onChangeText={(t) => { setTranscript(t); setConfirmed(false); }} multiline style={{ minHeight: 60, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {!confirmed ? (
              <Pressable onPress={() => setConfirmed(true)} style={{ backgroundColor: "#0f172a", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Confirm transcript</Text>
              </Pressable>
            ) : (
              <Text style={{ fontSize: 12, color: "#15803d", fontWeight: "600" }}>✓ Confirmed — will attach on Save</Text>
            )}
            <Pressable onPress={() => { if (!confirmed && transcript.length < 2) { Alert.alert("Confirm first", "Confirm transcript before attaching (or type manually)."); return; } onTranscript?.(transcript, audioUri ?? undefined); Alert.alert("Attached", "Transcript attached to item — save checklist to persist."); }} style={{ backgroundColor: confirmed || transcript.length >= 2 ? "#0ea5e9" : "#94a3b8", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Attach to {itemId ? "item" : "assessment"}</Text>
            </Pressable>
            <Pressable onPress={() => { setTranscript(""); setConfirmed(false); }} style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
              <Text style={{ fontSize: 12, color: "#64748b" }}>Discard</Text>
            </Pressable>
          </View>
          <Text style={{ fontSize: 11, color: "#64748b" }}>Do not auto-convert ambiguous speech to precise values — confirm numbers/units.</Text>
        </View>
      ) : null}

      {audioUri ? <Text style={{ fontSize: 11, color: "#64748b" }}>Original audio preserved: {audioUri.slice(0, 60)}…</Text> : null}
      {transcribing ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><ActivityIndicator /><Text style={{ fontSize: 12, color: "#64748b" }}>Transcribing… editable after, unconfirmed until you confirm</Text></View> : null}
      {error ? <View style={{ backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#dc2626" }}>{error} — you can type in the notes field instead.</Text></View> : null}

      <View style={{ borderTopWidth: 1, borderTopColor: "#f1f5f9", paddingTop: 10, gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569" }}>Or type observation manually (fallback)</Text>
        <TextInput placeholder="Type observation here if recording fails" multiline style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, minHeight: 44, color: "#0f172a", backgroundColor: "#fff" }} onEndEditing={(e) => { const t = e.nativeEvent.text; if (t) { setTranscript(t); setConfirmed(false); } }} />
      </View>
    </View>
  );
}
