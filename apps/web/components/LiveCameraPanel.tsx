"use client";
import { useEffect, useRef, useState } from "react";

type Analysis = { summary: string; observations?: string[]; limitations?: string[]; uncertainty?: string; fallback?: boolean };

/**
 * Honest gated live camera.
 * Continuous live guidance is NOT offered (see /api/live/status gate).
 * What this does: on explicit tap, opens the device camera for preview only
 * (no recording, stream stopped on capture/close), captures ONE manual frame,
 * sends it for suggestion-only analysis, and can save the frame as evidence.
 */
export function LiveCameraPanel({ assessmentId, itemId }: { assessmentId: string; itemId?: string }): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"idle" | "live" | "analyzing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => stopStream, []);

  async function start() {
    setError(null);
    setAnalysis(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser has no camera API — use photo upload instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState("live");
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      setError(name === "NotAllowedError" ? "Camera permission denied — allow access in the browser to preview, or use photo upload." : `Camera unavailable (${name || "unknown"}) — use photo upload.`);
    }
  }

  function close() {
    stopStream();
    setState("idle");
  }

  async function capture(analyze: boolean) {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setError("No live frame yet — wait for the preview, then capture.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const url = canvas.toDataURL("image/jpeg", 0.85);
    setFrameUrl(url);
    stopStream();
    setState("idle");
    if (!analyze) return;
    setState("analyzing");
    setError(null);
    try {
      const b64 = url.split(",")[1] ?? "";
      const res = await fetch("/api/ai/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64, mimeType: "image/jpeg", assessmentId, prompt: "Describe visible conditions relevant to this inspection. Never invent measurements or hidden conditions." }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Frame analysis failed");
      setAnalysis(data as Analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setState("idle");
    }
  }

  async function saveFrame() {
    if (!frameUrl) return;
    setError(null);
    try {
      const blob = await (await fetch(frameUrl)).blob();
      const fd = new FormData();
      fd.append("file", new File([blob], `live-frame-${Date.now()}.jpg`, { type: "image/jpeg" }));
      fd.append("assessmentId", assessmentId);
      if (itemId) fd.append("itemId", itemId);
      const res = await fetch("/api/evidence/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Save failed");
      setSavedKey((data as { storageKey?: string }).storageKey ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" aria-hidden />
        <h2 className="text-sm font-semibold">Live camera — manual frame only</h2>
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">no continuous guidance</span>
      </div>
      <p className="text-xs text-slate-600">Camera opens only when you tap Start, preview only, never recorded. Capture sends one frame for suggestion-only analysis — never a verified measurement.</p>

      {state === "live" ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-black">
            <video ref={videoRef} playsInline muted className="max-h-64 w-full object-contain" />
            <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white">Preview — not recording</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => capture(true)} className="btn-primary text-xs">Capture + analyze frame</button>
            <button onClick={() => capture(false)} className="btn-secondary text-xs">Capture without analysis</button>
            <button onClick={close} className="btn-secondary text-xs">Close camera</button>
          </div>
        </div>
      ) : (
        <button onClick={start} disabled={state === "analyzing"} className="btn-secondary text-xs">{state === "analyzing" ? "Analyzing…" : "Start camera preview"}</button>
      )}

      {error ? <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}

      {frameUrl ? (
        <div className="space-y-2">
          <img src={frameUrl} alt="Captured frame" className="max-h-48 rounded border border-slate-200" />
          <div className="flex gap-2">
            <button onClick={saveFrame} className="btn-secondary text-xs">Save frame as evidence</button>
            {savedKey ? <span className="text-xs text-green-700">Saved ✓ {savedKey.split("/").pop()}</span> : null}
          </div>
        </div>
      ) : null}

      {analysis ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="font-semibold text-slate-900">Frame suggestion — requires human review{analysis.fallback ? " (fallback, provider unreachable)" : ""}</div>
          <p className="mt-1 text-slate-700">{analysis.summary}</p>
          {analysis.observations?.length ? <ul className="mt-1 list-disc pl-4 text-slate-600">{analysis.observations.map((o, i) => <li key={i}>{o}</li>)}</ul> : null}
          <p className="mt-1 text-slate-500">Uncertainty: {analysis.uncertainty ?? "—"}. {analysis.limitations?.join(" ") ?? ""}</p>
        </div>
      ) : null}
    </div>
  );
}
