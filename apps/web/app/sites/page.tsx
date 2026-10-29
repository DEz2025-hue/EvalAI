"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Site = { id: string; name: string; address?: string; createdAt: string; jobCount?: number };

export default function SitesPage(): JSX.Element {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sites");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to load sites");
      setSites(((data as { sites?: Site[] }).sites ?? []) as Site[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function rename(id: string) {
    setError(null);
    try {
      const res = await fetch("/api/sites", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name: draft }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Rename failed");
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) return <div className="mx-auto max-w-3xl py-10 text-sm text-slate-500">Loading sites…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      <h1 className="text-xl font-semibold">Sites · {sites.length}</h1>
      <p className="text-sm text-slate-600">Every job belongs to a site. Rename here; jobs keep pointing at the same site.</p>
      {error ? <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      {sites.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          No sites yet — sites are created when you create your first job.
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/assessments/new" className="btn-primary text-xs">New assessment</Link>
            <Link href="/inspections/new" className="btn-secondary text-xs">New inspection</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {sites.map((s) => (
            <div key={s.id} className="card flex items-center justify-between p-3">
              <div className="flex-1">
                {editing === s.id ? (
                  <div className="flex gap-2">
                    <input value={draft} onChange={(e) => setDraft(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
                    <button onClick={() => rename(s.id)} className="btn-primary text-xs">Save</button>
                    <button onClick={() => setEditing(null)} className="btn-secondary text-xs">Cancel</button>
                  </div>
                ) : (
                  <>
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-slate-500">{s.address ?? "—"} · {s.jobCount ?? 0} jobs</div>
                  </>
                )}
              </div>
              {editing !== s.id ? <button onClick={() => { setEditing(s.id); setDraft(s.name); }} className="text-xs text-sky-600 hover:underline">Rename</button> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
