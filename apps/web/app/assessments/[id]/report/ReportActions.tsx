"use client";
import { useState } from "react";

export function ReportActions({ assessmentId }: { assessmentId: string }): JSX.Element {
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [snapId, setSnapId] = useState<string | null>(null);

  async function createSnapshotAndPdf(finalize: boolean, includeMaterials: boolean) {
    setDownloading(true);
    setMsg(null);
    try {
      // Step 1: create immutable snapshot from stored facts (versioned, deterministic)
      const snapRes = await fetch("/api/reports/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, includeMaterials, finalize }),
      });
      const snapData = await snapRes.json();
      if (!snapRes.ok) throw new Error(snapData.error || "Snapshot failed");
      const snapshotId = snapData.snapshot.id as string;
      setSnapId(snapshotId);
      // Step 2: generate PDF from that snapshot (assembled, not re-generated from AI)
      const pdfRes = await fetch("/api/reports/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId }),
      });
      const data = await pdfRes.json();
      if (!pdfRes.ok) throw new Error(data.error || "PDF failed");
      const bytes = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.snapshot.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      const storageNote = data.storageUploaded ? ` · stored ${data.artifactKey} · signed URL ${data.signedUrl ? "ready (1h)" : "pending"}` : data.storageError ? ` · storage fallback: ${data.storageError}` : "";
      setMsg(`Downloaded ${data.pdfBytes} bytes — ${data.snapshot.finalized ? "finalized (immutable)" : "draft"} snapshot ${data.snapshot.id}${storageNote}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => window.print()} className="btn-secondary text-xs">Print HTML</button>
        <button onClick={() => createSnapshotAndPdf(false, false)} disabled={downloading} className="btn-primary text-xs">{downloading ? "Generating…" : "Download PDF (without materials)"}</button>
        <button onClick={() => createSnapshotAndPdf(false, true)} disabled={downloading} className="btn-secondary text-xs">{downloading ? "…" : "PDF with materials"}</button>
        <button onClick={() => createSnapshotAndPdf(true, true)} disabled={downloading} className="btn-secondary text-xs border-amber-300">Finalize & PDF</button>
      </div>
      {snapId && <p className="text-xs text-slate-500">Last snapshot: <code>{snapId}</code> — later edits create new versions, never mutate finalized reports.</p>}
      {msg && <p className="text-xs text-slate-700 rounded bg-slate-50 border border-slate-200 px-3 py-2">{msg}</p>}
      <p className="text-xs text-slate-500">Export failure does not lose saved assessment or snapshot — retry. Snapshot is versioned (assessmentVersion/materialsVersion/quotationVersion) and immutable after finalize.</p>
    </div>
  );
}
