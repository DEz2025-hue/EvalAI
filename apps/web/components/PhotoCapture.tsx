"use client";
import { useState } from "react";

export function PhotoCapture({ assessmentId, itemId, onUploaded }: { assessmentId: string; itemId?: string; onUploaded: (key: string) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyze, setAnalyze] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) { setError("Only JPEG/PNG/WebP allowed"); return; }
    if (f.size > 15 * 1024 * 1024) { setError("Image too large (>15MB)"); return; }
    const url = URL.createObjectURL(f);
    setPreview(url);
    setError(null);
  }

  async function upload() {
    const input = document.querySelector<HTMLInputElement>('input[type="file"][data-photo-input]');
    const file = input?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      // Client uploads to server route which validates, stores to private bucket, creates signed URL
      const fd = new FormData();
      fd.append("file", file);
      if (assessmentId) fd.append("assessmentId", assessmentId);
      if (itemId) fd.append("itemId", itemId);
      const res = await fetch("/api/evidence/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onUploaded(data.storageKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function requestAnalysis() {
    const input = document.querySelector<HTMLInputElement>('input[type="file"][data-photo-input]');
    const file = input?.files?.[0];
    if (!file || !preview) return;
    const base64 = await fileToBase64(file);
    setAnalyze("Analyzing — suggestion only, not a verified measurement...");
    try {
      const res = await fetch("/api/ai/analyze-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64: base64, mimeType: file.type, assessmentId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAnalyze(`${data.summary}\nLimitations: ${(data.limitations ?? []).join("; ")}\nUncertainty: ${data.uncertainty}`);
    } catch (e) {
      setAnalyze(`Analysis unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <label className="block text-xs font-medium">Photo — capture or select, linked to {itemId ? "checklist item" : "assessment"}</label>
      <input data-photo-input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={onPick} className="mt-2 block w-full text-sm" />
      {preview && <img src={preview} alt="Preview" className="mt-3 max-h-64 rounded-lg border border-slate-200" />}
      <div className="mt-3 flex gap-2">
        <button onClick={upload} disabled={!preview || uploading} className="btn-primary text-xs">{uploading ? "Uploading…" : "Upload to private storage"}</button>
        <button onClick={requestAnalysis} disabled={!preview} className="btn-secondary text-xs">Request AI analysis</button>
        <button onClick={() => setPreview(null)} className="btn-secondary text-xs">Remove preview</button>
      </div>
      <p className="mt-2 text-xs text-slate-500">Private by default — short-lived signed URL only after authorization. AI visual output is a suggestion; never treat as verified dimension.</p>
      {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {analyze && <pre className="mt-2 whitespace-pre-wrap rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">{analyze}</pre>}
    </div>
  );
}

function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(f);
  });
}
