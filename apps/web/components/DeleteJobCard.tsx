"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "./useRole";

/**
 * Permanently deletes a job (decision D-020). Shown to owners and admins only; the server checks the role again.
 * The server also says when a finalized report is involved, and then wants the site name typed back.
 */
export function DeleteJobCard({ assessmentId, siteName, backHref }: { assessmentId: string; siteName: string; backHref: string }): JSX.Element | null {
  const router = useRouter();
  const { isAdmin, loaded } = useRole();
  const [confirming, setConfirming] = useState(false);
  const [needName, setNeedName] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loaded || !isAdmin) return null;

  async function send(confirmName?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(confirmName ? { confirmName } : {}) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; needsConfirmName?: boolean };
      if (res.status === 400 && data.needsConfirmName) {
        setNeedName(true);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Could not delete the job");
      router.replace(backHref as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const nameMatches = typed.trim().toLowerCase() === siteName.trim().toLowerCase() && typed.trim().length > 0;

  return (
    <div className="card space-y-3 border-red-200 p-4">
      <h2 className="text-sm font-semibold text-red-700">Danger zone</h2>
      <p className="text-xs text-slate-600">Deleting a job removes its checklist, pictures, audio, findings, notes and reports for good. This can&apos;t be undone.</p>
      {needName ? (
        <div className="space-y-2">
          <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-800">This job has a finalized report. The signed report will be destroyed with it. Type the site name <strong>{siteName}</strong> to confirm.</p>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={siteName} aria-label="Site name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button type="button" disabled={!nameMatches || busy} onClick={() => void send(typed)} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">{busy ? "Deleting…" : "Delete job and report"}</button>
            <button type="button" onClick={() => { setNeedName(false); setTyped(""); }} className="btn-secondary text-xs">Cancel</button>
          </div>
        </div>
      ) : confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-red-700">Delete this job for good?</span>
          <button type="button" disabled={busy} onClick={() => void send()} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">{busy ? "Deleting…" : "Yes, delete"}</button>
          <button type="button" onClick={() => setConfirming(false)} className="btn-secondary text-xs">Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700">Delete job</button>
      )}
      {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
