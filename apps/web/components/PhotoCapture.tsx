"use client";
import { useRef, useState } from "react";
import { uploadEvidence } from "../lib/clientUpload";

export function PhotoCapture({ assessmentId, itemId, items, onUploaded }: { assessmentId: string; itemId?: string; items?: Array<{ id: string; title: string }>; onUploaded: (key: string, linkedItemId?: string) => void }): JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedItem, setSelectedItem] = useState<string>(itemId ?? "");
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
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const data = await uploadEvidence(file, { assessmentId, itemId: selectedItem || undefined });
      onUploaded(data.storageKey, selectedItem || undefined);
      clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  function clear() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function requestAnalysis() {
    const file = fileRef.current?.files?.[0];
    if (!file || !preview) return;
    const base64 = await fileToBase64(file);
    setAnalyze("Analyzing — suggestion only, not a verified measurement...");
    try {
      const res = await fetch("/api/ai/analyze-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64: base64, mimeType: file.type, assessmentId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAnalyze(`${data.summary}
Limitations: ${(data.limitations ?? []).join("; ")}
Confidence: ${data.uncertainty}`);
    } catch (e) {
      setAnalyze(`Analysis unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <label className="block text-xs font-medium">Photo — capture or select, linked to {selectedItem ? "the selected checklist item" : "the job"}</label>
      {items && items.length > 0 ? (
        <label className="mt-2 block text-xs">Link to checklist item (optional)
          <select value={selectedItem} onChange={(e) => setSelectedItem(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
            <option value="">Whole job (no specific item)</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.title}</option>)}
          </select>
        </label>
      ) : null}
      <input ref={fileRef} data-photo-input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={onPick} className="mt-2 block w-full text-sm" />
      {preview && <img src={preview} alt="Preview" className="mt-3 max-h-64 rounded-lg border border-slate-200" />}
      <div className="mt-3 flex gap-2">
        <button onClick={upload} disabled={!preview || uploading} className="btn-primary text-xs">{uploading ? "Uploading…" : "Upload photo"}</button>
        <button onClick={requestAnalysis} disabled={!preview} className="btn-secondary text-xs">Analyze photo</button>
        <button onClick={clear} className="btn-secondary text-xs">Remove</button>
      </div>
      <p className="mt-2 text-xs text-slate-500">Photos are stored privately and shared only with your workspace. AI image analysis is a suggestion — always confirm measurements yourself.</p>
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
