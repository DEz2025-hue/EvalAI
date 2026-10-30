"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SolarCreateForm() {
  const router = useRouter();
  const [siteName, setSiteName] = useState("");
  const [address, setAddress] = useState("");
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const id = `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      router.push(`/assessments/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Mode<div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">Assessment</div></label>
        <label className="text-sm">Pack<div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">Solar</div></label>
      </div>
      <label className="block text-sm">Site name *<input value={siteName} onChange={(e) => setSiteName(e.target.value)} required minLength={2} maxLength={100} placeholder="e.g. 12 Acacia Rd — roof" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <label className="block text-sm">Address / location<input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <label className="block text-sm">Goal / scope<textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} placeholder="New install / existing / upgrade / repair — describe requested outcome, constraints, known equipment" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary">{saving ? "Creating…" : "Create & open checklist"}</button>
        <a href="/assessments" className="btn-secondary">Cancel</a>
      </div>
      {error && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <p className="text-xs text-slate-500">Saves as draft — you can resume it from Assessments.</p>
    </form>
  );
}
