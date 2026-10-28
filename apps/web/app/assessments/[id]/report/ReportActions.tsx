"use client";
import { useState } from "react";

export function ReportActions({ assessmentId }: { assessmentId: string }) {
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function downloadPdf(finalize: boolean) {
    setDownloading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/reports/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId,
          mode: "assessment",
          pack: "solar",
          siteName: "Site demo",
          context: { goal: "Demo report — deterministic from snapshot" },
          checklist: [{ title: "Site access & safety", status: "not_checked", notes: "≠ Pass" }],
          measurements: [],
          findings: [],
          materials: [{ description: "Demo panel", quantity: 2, unit: "pc", rationale: "user_input demo", provisional: true }],
          quotation: null,
          limitations: ["Demo limitations — provisional quantities"],
          finalize,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "PDF failed");
      // Decode base64 and trigger download — deterministic bytes from versioned snapshot
      const bytes = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.snapshot.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Downloaded ${data.pdfBytes} bytes — ${finalize ? "finalized (immutable)" : "draft"} snapshot ${data.snapshot.id}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button onClick={() => window.print()} className="btn-secondary text-xs">Print HTML</button>
        <button onClick={() => downloadPdf(false)} disabled={downloading} className="btn-primary text-xs">{downloading ? "Generating…" : "Download PDF (draft)"}</button>
        <button onClick={() => downloadPdf(true)} disabled={downloading} className="btn-secondary text-xs">Finalize & PDF</button>
      </div>
      {msg && <p className="text-xs text-slate-600">{msg}</p>}
    </div>
  );
}
