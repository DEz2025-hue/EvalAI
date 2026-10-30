"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "assessment" | "inspection";
type Pack = "solar" | "cctv";

const PACK_LABEL: Record<Pack, string> = { solar: "Solar", cctv: "CCTV" };

/**
 * One create form for every job type. It always creates the job through POST /api/assessments —
 * if that fails the error is shown and nothing is navigated to (no phantom/demo ids).
 */
export function JobCreateForm({ mode, initialPack = "solar", lockPack = false }: { mode: Mode; initialPack?: Pack; lockPack?: boolean }): JSX.Element {
  const router = useRouter();
  const [pack, setPack] = useState<Pack>(initialPack);
  const [siteName, setSiteName] = useState("");
  const [address, setAddress] = useState("");
  const [goal, setGoal] = useState("");
  const [sites, setSites] = useState<Array<{ id: string; name: string; address?: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((d: { sites?: Array<{ id: string; name: string; address?: string }> }) => setSites(d.sites ?? []))
      .catch(() => setSites([]));
  }, []);

  const isInspection = mode === "inspection";
  const base = isInspection ? "/inspections" : "/assessments";

  function onSiteChange(value: string) {
    setSiteName(value);
    const known = sites.find((s) => s.name.toLowerCase() === value.trim().toLowerCase());
    if (known?.address && !address) setAddress(known.address);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, pack, siteName: siteName.trim(), address: address.trim() || undefined, goal: goal.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string; issues?: Array<{ message: string }> };
      if (!res.ok || !data.id) {
        const detail = data.issues?.[0]?.message;
        throw new Error(data.error ? (detail ? `${data.error}: ${detail}` : data.error) : "Could not create the job — please try again");
      }
      router.push(`${base}/${data.id}?pack=${pack}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">Mode: {isInspection ? "Inspection" : "Assessment"}</div>
        {lockPack ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">Pack: {PACK_LABEL[pack]}</div>
        ) : (
          <select aria-label="Pack" value={pack} onChange={(e) => setPack(e.target.value as Pack)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="solar">Pack: Solar</option>
            <option value="cctv">Pack: CCTV</option>
          </select>
        )}
      </div>
      <label className="block text-sm">
        Site name *
        <input list="known-sites" value={siteName} onChange={(e) => onSiteChange(e.target.value)} required minLength={2} maxLength={100} placeholder={pack === "solar" ? "e.g. 12 Acacia Rd — roof" : "e.g. Warehouse — perimeter"} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <datalist id="known-sites">{sites.map((s) => <option key={s.id} value={s.name} />)}</datalist>
      </label>
      <label className="block text-sm">
        Address / location
        <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} placeholder="Optional" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <label className="block text-sm">
        {isInspection ? "Inspection scope / requirements" : "Goal / scope"}
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} maxLength={500} placeholder={isInspection ? "Scope, standard, or requirements to check against" : "New install / existing / upgrade / repair — describe requested outcome, constraints, known equipment"} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary">{saving ? "Creating…" : isInspection ? "Create & open inspection" : "Create & open checklist"}</button>
        <a href={base} className="btn-secondary">Cancel</a>
      </div>
      {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <p className="text-xs text-slate-500">Saves as a draft you can resume from {isInspection ? "Inspections" : "Assessments"}. Existing sites are reused by name.</p>
    </form>
  );
}
