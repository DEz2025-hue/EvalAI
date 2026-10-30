"use client";
import { useRef, useState } from "react";

type PermissionState = "unknown" | "granted" | "denied" | "prompt" | "unsupported";

export function VoiceRecorder({ onTranscript, assessmentId, itemId }: { onTranscript: (t: string, audioId?: string) => void; assessmentId?: string; itemId?: string }): JSX.Element {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perm, setPerm] = useState<PermissionState>("unknown");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioKey, setAudioKey] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  async function checkPermission(): Promise<PermissionState> {
    if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
    try {
      // @ts-ignore - permissions API may not be available
      const status = await navigator.permissions?.query({ name: "microphone" as PermissionName });
      if (status?.state) return status.state as PermissionState;
    } catch {}
    return "prompt";
  }

  async function start() {
    setError(null);
    setConfirmed(false);
    const p = await checkPermission();
    setPerm(p);
    if (p === "unsupported") {
      setError("Microphone not supported on this device/browser — use text input to capture observations.");
      return;
    }
    if (p === "denied") {
      setError("Microphone permission denied — enable it in browser settings, or type your observation in the text field below.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPerm("granted");
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onerror = () => setError("Recording interrupted — check microphone and try again, or type instead.");
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        // Preserve original audio — upload to  where supported
        try {
          const fd = new FormData();
          fd.append("file", blob, `voice-${Date.now()}.webm`);
          if (assessmentId) fd.append("assessmentId", assessmentId);
          if (itemId) fd.append("itemId", itemId);
          const up = await fetch("/api/voice/upload", { method: "POST", body: fd });
          const uj = await up.json().catch(() => ({}));
          if (uj.storageKey) setAudioKey(uj.storageKey);
        } catch {}
        // Transcription — editable, stays unconfirmed until user confirms
        const base64 = await blobToBase64(blob);
        try {
          const res = await fetch("/api/ai/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audioBase64: base64, mimeType: "audio/webm" }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Transcription unavailable");
          setTranscript(data.transcript);
          setConfirmed(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
      const startAt = Date.now();
      timerRef.current = window.setInterval(() => setDuration(Math.floor((Date.now() - startAt) / 1000)), 200);
    } catch (e) {
      const err = e as Error & { name?: string };
      if (err.name === "NotAllowedError") {
        setPerm("denied");
        setError("Microphone permission denied — allow access in browser/site settings, or type your observation below.");
      } else if (err.name === "NotFoundError") {
        setError("No microphone found — connect a microphone or type your observation.");
      } else if (err.name === "NotSupportedError") {
        setError("Audio recording not supported on this platform — type your observation instead.");
      } else {
        setError(err.message || String(e));
      }
    }
  }

  function stop() {
    mediaRef.current?.stop();
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
  }

  function cancel() {
    try { mediaRef.current?.stop(); } catch {}
    setRecording(false);
    setTranscript("");
    setConfirmed(false);
    setError(null);
    setAudioUrl(null);
    setAudioKey(null);
    chunksRef.current = [];
    if (timerRef.current) window.clearInterval(timerRef.current);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 flex-wrap">
        {!recording ? (
          <button onClick={start} className="btn-primary text-xs">● Record</button>
        ) : (
          <>
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-600"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> {duration}s recording</span>
            <button onClick={stop} className="btn-secondary text-xs">Stop</button>
            <button onClick={cancel} className="btn-secondary text-xs">Cancel</button>
          </>
        )}
        <span className="text-xs text-slate-500">Mic permission asked only when you press Record. Original audio preserved where supported.</span>
      </div>
      {perm === "denied" && <p className="mt-2 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">Permission denied — enable microphone in browser settings or use the text input below to continue manually.</p>}
      {perm === "unsupported" && <p className="mt-2 rounded bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">Recording not supported on this browser — type your observation to continue.</p>}
      {audioUrl && (
        <div className="mt-3">
          <label className="text-xs font-medium text-slate-700">Original audio {audioKey ? `· ${audioKey}` : "(local preview, upload pending env)"}</label>
          <audio controls src={audioUrl} className="mt-1 w-full" />
        </div>
      )}
      {transcript !== "" && (
        <div className="mt-3">
          <label className="text-xs font-medium text-slate-700">Transcript — editable, <span className={confirmed ? "text-green-700" : "text-amber-700"}>{confirmed ? "confirmed" : "unconfirmed until you confirm"}</span></label>
          <textarea value={transcript} onChange={(e) => { setTranscript(e.target.value); setConfirmed(false); }} rows={3} className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${confirmed ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`} />
          <div className="mt-2 flex gap-2 flex-wrap">
            {!confirmed ? <button onClick={() => setConfirmed(true)} className="btn-secondary text-xs">Confirm transcript</button> : <span className="inline-flex items-center rounded bg-green-100 px-2 py-1 text-xs text-green-800">✓ Confirmed — saved as a note when you press Attach</span>}
            <button onClick={() => { if (confirmed) onTranscript(transcript, audioKey ?? undefined); }} className="btn-primary text-xs" disabled={!confirmed || transcript.trim().length < 2}>Attach to {itemId ? "item" : assessmentId ? "assessment" : "note"}</button>
            <button onClick={() => { setTranscript(""); setConfirmed(false); setAudioUrl(null); }} className="btn-secondary text-xs">Discard</button>
          </div>
          <p className="mt-1 text-xs text-slate-500">Do not auto-convert ambiguous speech into precise values — confirm numbers/units. Text fallback always available below.</p>
        </div>
      )}
      {error && <p className="mt-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error} — you can type your observation in the notes field instead.</p>}
      <div className="mt-3 border-t border-slate-100 pt-2">
        <label className="text-xs font-medium text-slate-600">Or type observation manually (fallback)</label>
        <textarea placeholder="Type observation here if recording fails or is unavailable" rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" onChange={(e) => { if (e.target.value) setTranscript(e.target.value); }} />
      </div>
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
