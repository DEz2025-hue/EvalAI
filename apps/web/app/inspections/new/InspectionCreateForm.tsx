"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function InspectionCreateForm() {
  const router = useRouter();
  const [siteName, setSiteName] = useState("");
  const [pack, setPack] = useState<"solar" | "cctv">("solar");
  const [scope, setScope] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "inspection", pack, siteName, goal: scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      router.push(`/inspections/${data.id}?pack=${pack}` as never);
    } catch (err) {
      const id = `demo-inspect-${Date.now().toString(36)}`;
      setError(err instanceof Error ? err.message : String(err));
      router.push(`/inspections/${id}?pack=${pack}` as never);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">Mode: Inspection</div>
        <select value={pack} onChange={(e) => setPack(e.target.value as "solar" | "cctv")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="solar">Pack: Solar</option>
          <option value="cctv">Pack: CCTV</option>
        </select>
      </div>
      <label className="block text-sm">Site name *<input value={siteName} onChange={(e) => setSiteName(e.target.value)} required placeholder="e.g. 12 Acacia Rd — switchboard" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <label className="block text-sm">Inspection scope / requirements<textarea value={scope} onChange={(e) => setScope(e.target.value)} rows={3} placeholder="Scope, standard, or requirements to check against" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary">{saving ? "Creating…" : "Create & open inspection"}</button>
        <a href="/inspections" className="btn-secondary">Cancel</a>
      </div>
      {error && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{error} — navigating with demo ID</p>}
      <p className="text-xs text-slate-500">Shares same engine as Assessment — pack template, checklist statuses, evidence, measurements, report snapshots.</p>
    </form>
  );
}
