"use client";
import { useRef, useState } from "react";

export function VoiceRecorder({ onTranscript, assessmentId, itemId }: { onTranscript: (t: string, audioId?: string) => void; assessmentId?: string; itemId?: string }) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // Keep original audio — try upload to /api/evidence (TODO), but always allow transcription attempt
        const base64 = await blobToBase64(blob);
        try {
          const res = await fetch("/api/ai/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audioBase64: base64, mimeType: "audio/webm" }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Transcription failed");
          setTranscript(data.transcript);
          onTranscript(data.transcript);
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
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function stop() {
    mediaRef.current?.stop();
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
  }

  function cancel() {
    mediaRef.current?.stop();
    setRecording(false);
    setTranscript("");
    setError(null);
    chunksRef.current = [];
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2">
        {!recording ? (
          <button onClick={start} className="btn-primary text-xs">● Record</button>
        ) : (
          <>
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-600"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> {duration}s</span>
            <button onClick={stop} className="btn-secondary text-xs">Stop</button>
            <button onClick={cancel} className="btn-secondary text-xs">Cancel</button>
          </>
        )}
        <span className="text-xs text-slate-500">Mic permission asked only when you press Record. Audio preserved where supported.</span>
      </div>
      {transcript && (
        <div className="mt-3">
          <label className="text-xs font-medium text-slate-700">Transcript — editable, unconfirmed until you confirm</label>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm" />
          <div className="mt-2 flex gap-2">
            <button onClick={() => onTranscript(transcript)} className="btn-primary text-xs">Attach to {itemId ? "item" : assessmentId ? "assessment" : "note"}</button>
            <button onClick={() => setTranscript("")} className="btn-secondary text-xs">Discard</button>
          </div>
          <p className="mt-1 text-xs text-amber-700">Do not auto-convert ambiguous speech into precise values — confirm numbers/units.</p>
        </div>
      )}
      {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error} — you can type instead.</p>}
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
