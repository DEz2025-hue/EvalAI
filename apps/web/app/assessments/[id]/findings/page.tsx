"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Finding = { id: string; title: string; description?: string; severity?: "low" | "medium" | "high"; status: string; evidenceRefs: string[]; createdAt: string };

export default function FindingsPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id as string;
  const router = useRouter();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/findings?assessmentId=${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to load findings");
      setFindings(((data as { findings?: Finding[] }).findings ?? []) as Finding[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function review(findingId: string, status: "confirmed" | "rejected") {
    try {
      const res = await fetch("/api/findings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: findingId, status }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Review failed");
      setFindings((prev) => prev.map((f) => (f.id === findingId ? { ...f, status } : f)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) return <div className="mx-auto max-w-3xl py-10 text-sm text-slate-500">Loading findings…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Findings · {id.slice(0, 8)}</h1>
        <span className="text-xs bg-slate-100 px-2 py-1 rounded">{findings.length} findings</span>
      </div>
      <p className="text-sm text-slate-600">Human-reviewed findings — AI drafts land here only after you press Save, and stay unconfirmed until you confirm them.</p>
      {error ? <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      {findings.length === 0 && !loading ? (
        <div className="card p-8 text-center text-sm text-slate-500">No findings yet — request an AI analysis on the assessment overview, edit a draft, and press Save finding.</div>
      ) : (
        <div className="space-y-2">
          {findings.map((f) => (
            <div key={f.id} className="card p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{f.title}</span>
                {f.severity ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{f.severity}</span> : null}
                <span className={`rounded px-1.5 py-0.5 text-xs ${f.status === "confirmed" ? "bg-green-100 text-green-700" : f.status === "rejected" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-800"}`}>{f.status.replace("_", " ")}</span>
              </div>
              {f.description ? <p className="mt-1 text-sm text-slate-600">{f.description}</p> : null}
              <p className="mt-1 text-xs text-slate-500">Evidence: {f.evidenceRefs.length > 0 ? f.evidenceRefs.join(", ") : "—"} · {new Date(f.createdAt).toLocaleString()}</p>
              {f.status === "needs_review" ? (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => review(f.id, "confirmed")} className="btn-primary text-xs">Confirm</button>
                  <button onClick={() => review(f.id, "rejected")} className="btn-secondary text-xs">Reject</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => router.push(`/assessments/${id}`)} className="btn-secondary text-sm">Back to assessment</button>
        <button onClick={() => router.push(`/assessments/${id}/materials`)} className="btn-secondary text-sm">Materials & quotes →</button>
      </div>
    </div>
  );
}
