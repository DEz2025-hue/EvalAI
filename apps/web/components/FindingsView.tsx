"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRole } from "./useRole";

type Finding = {
  id: string;
  title: string;
  description?: string;
  severity?: "low" | "medium" | "high";
  status: string;
  evidenceRefs: string[];
  uncertainty?: string;
  missingInputs?: string[];
  reviewedAt?: string;
  createdAt: string;
};
type Evidence = { id: string; storage_key: string; mime_type: string; item_id: string | null };

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  rejected: "bg-slate-200 text-slate-600",
  needs_review: "bg-amber-100 text-amber-800",
};

/** Findings for a job — shared by Assessments and Inspections (basePath differs). Works with AI unavailable. */
export function FindingsView({ id, basePath }: { id: string; basePath: "/assessments" | "/inspections" }): JSX.Element {
  const router = useRouter();
  const { canWrite, loaded: roleLoaded } = useRole();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", severity: "" as "" | "low" | "medium" | "high", uncertainty: "", refs: [] as string[] });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fRes, eRes] = await Promise.all([fetch(`/api/findings?assessmentId=${id}`), fetch(`/api/evidence/upload?assessmentId=${id}`)]);
      const fData = await fRes.json().catch(() => ({}));
      if (!fRes.ok) throw new Error((fData as { error?: string }).error ?? "Failed to load findings");
      setFindings(((fData as { findings?: Finding[] }).findings ?? []) as Finding[]);
      if (eRes.ok) setEvidence((((await eRes.json()) as { items?: Evidence[] }).items ?? []) as Evidence[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(findingId: string, status: "confirmed" | "rejected" | "needs_review") {
    setError(null);
    try {
      const res = await fetch("/api/findings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: findingId, status }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Review failed");
      const updated = (data as { finding?: Finding }).finding;
      setFindings((prev) => prev.map((f) => (f.id === findingId ? { ...f, ...(updated ?? {}), status } : f)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function addFinding(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId: id,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          severity: form.severity || undefined,
          uncertainty: form.uncertainty.trim() || undefined,
          evidenceRefs: form.refs,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Could not save finding");
      setForm({ title: "", description: "", severity: "", uncertainty: "", refs: [] });
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const toggleRef = (evId: string) => setForm((f) => ({ ...f, refs: f.refs.includes(evId) ? f.refs.filter((r) => r !== evId) : [...f.refs, evId] }));
  const unreviewed = findings.filter((f) => f.status === "needs_review").length;

  if (loading) return <div className="mx-auto max-w-3xl py-10 text-sm text-slate-500">Loading findings…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Findings · {id.slice(0, 8)}</h1>
        <span className="text-xs bg-slate-100 px-2 py-1 rounded">{findings.length} findings{unreviewed ? ` · ${unreviewed} to review` : ""}</span>
      </div>
      <p className="text-sm text-slate-600">Every finding stays traceable to its evidence and is unconfirmed until a person reviews it. You can add findings yourself — AI is optional.</p>
      {error ? <div role="alert" className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      {roleLoaded && !canWrite ? <div className="rounded bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">Your role is read-only in this workspace.</div> : null}

      {canWrite ? (
        adding ? (
          <form onSubmit={addFinding} className="card p-3 space-y-3">
            <label className="block text-sm">Title *<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} maxLength={300} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
            <label className="block text-sm">Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={5000} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">Severity
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as typeof form.severity })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">Not rated</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </select>
              </label>
              <label className="block text-sm">Uncertainty / what is unknown<input value={form.uncertainty} onChange={(e) => setForm({ ...form, uncertainty: e.target.value })} maxLength={500} placeholder="e.g. cable route not visible" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
            </div>
            <fieldset>
              <legend className="text-sm">Supporting evidence</legend>
              {evidence.length === 0 ? <p className="mt-1 text-xs text-slate-500">No evidence uploaded yet — add photos in the Evidence step to link them.</p> : (
                <div className="mt-1 flex flex-wrap gap-2">
                  {evidence.map((ev) => (
                    <label key={ev.id} className={`flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs ${form.refs.includes(ev.id) ? "border-teal-500 bg-teal-50" : "border-slate-200"}`}>
                      <input type="checkbox" checked={form.refs.includes(ev.id)} onChange={() => toggleRef(ev.id)} />
                      {ev.storage_key.split("/").pop()?.slice(0, 28) ?? ev.id.slice(0, 8)}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary text-xs">{saving ? "Saving…" : "Save finding"}</button>
              <button type="button" onClick={() => setAdding(false)} className="btn-secondary text-xs">Cancel</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setAdding(true)} className="btn-secondary text-sm">+ Add finding</button>
        )
      ) : null}

      {findings.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No findings yet. Add one yourself, or request an AI analysis from the overview and save the drafts you agree with.</div>
      ) : (
        <div className="space-y-2">
          {findings.map((f) => (
            <div key={f.id} className="card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{f.title}</span>
                {f.severity ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{f.severity}</span> : null}
                <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[f.status] ?? "bg-slate-100"}`}>{f.status.replace("_", " ")}</span>
              </div>
              {f.description ? <p className="mt-1 text-sm text-slate-600">{f.description}</p> : null}
              {f.uncertainty ? <p className="mt-1 text-xs text-amber-800">Uncertainty: {f.uncertainty}</p> : null}
              {f.missingInputs && f.missingInputs.length > 0 ? <p className="mt-1 text-xs text-slate-500">Missing: {f.missingInputs.join("; ")}</p> : null}
              <p className="mt-1 text-xs text-slate-500">
                Evidence:{" "}
                {f.evidenceRefs.length > 0
                  ? f.evidenceRefs.map((r) => <Link key={r} href={`${basePath}/${id}/evidence`} className="mr-1 underline">{r.slice(0, 8)}</Link>)
                  : "none linked"}
                {" · "}{new Date(f.createdAt).toLocaleString()}
                {f.reviewedAt ? ` · reviewed ${new Date(f.reviewedAt).toLocaleString()}` : ""}
              </p>
              {canWrite ? (
                <div className="mt-2 flex gap-2">
                  {f.status === "needs_review" ? (
                    <>
                      <button onClick={() => review(f.id, "confirmed")} className="btn-primary text-xs">Confirm</button>
                      <button onClick={() => review(f.id, "rejected")} className="btn-secondary text-xs">Reject</button>
                    </>
                  ) : (
                    <button onClick={() => review(f.id, "needs_review")} className="btn-secondary text-xs">Reopen review</button>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => router.push(`${basePath}/${id}` as never)} className="btn-secondary text-sm">Back to {basePath === "/inspections" ? "inspection" : "assessment"}</button>
        <button onClick={() => router.push(`${basePath}/${id}/completeness` as never)} className="btn-secondary text-sm">Completeness →</button>
      </div>
    </div>
  );
}
