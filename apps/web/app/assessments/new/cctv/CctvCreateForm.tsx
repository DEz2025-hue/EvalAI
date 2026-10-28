"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CctvCreateForm() {
  const router = useRouter();
  const [siteName, setSiteName] = useState("");
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/assessments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "assessment", pack: "cctv", siteName, goal }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      router.push(`/assessments/${data.id}?pack=cctv`);
    } catch (err) {
      // fallback to demo id so workflow stays walkable without DB
      const id = `demo-cctv-${Date.now().toString(36)}`;
      setError(err instanceof Error ? err.message : String(err));
      router.push(`/assessments/${id}?pack=cctv`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">Mode: Assessment</div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">Pack: CCTV — cameras, NVR, network, power, cabling, retention</div>
      </div>
      <label className="block text-sm">Site name *<input value={siteName} onChange={(e) => setSiteName(e.target.value)} required placeholder="e.g. Warehouse — perimeter" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <label className="block text-sm">Goal / coverage<input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. 6 cameras, retail floor + entrance, 14-day retention" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <div className="flex gap-2"><button type="submit" disabled={saving} className="btn-primary">{saving ? "Creating…" : "Create & open checklist"}</button><a href="/assessments" className="btn-secondary">Cancel</a></div>
      {error && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{error} — navigating with demo ID</p>}
    </form>
  );
}
