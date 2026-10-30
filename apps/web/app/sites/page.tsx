"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRole } from "../../components/useRole";

type Site = { id: string; name: string; address?: string; createdAt: string; jobCount?: number };
type Job = { id: string; siteId: string | null; siteName?: string; mode: "assessment" | "inspection"; pack: string; status: string; createdAt: string };

export default function SitesPage(): JSX.Element {
  const { canWrite, isAdmin, loaded } = useRole();
  const [sites, setSites] = useState<Site[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", address: "" });
  const [adding, setAdding] = useState(false);
  const [newSite, setNewSite] = useState({ name: "", address: "" });
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, j] = await Promise.all([fetch("/api/sites"), fetch("/api/assessments")]);
      const sd = (await s.json().catch(() => ({}))) as { sites?: Site[]; error?: string };
      if (!s.ok) throw new Error(sd.error ?? "Failed to load sites");
      setSites(sd.sites ?? []);
      if (j.ok) setJobs(((await j.json()) as { items?: Job[] }).items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function call(method: string, body: unknown, url = "/api/sites"): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (await call("POST", { name: newSite.name, address: newSite.address || undefined })) {
      setNewSite({ name: "", address: "" });
      setAdding(false);
    }
  }
  async function save(id: string) {
    if (await call("PATCH", { id, name: draft.name, address: draft.address.trim() ? draft.address : null })) setEditing(null);
  }
  async function remove(s: Site) {
    if (!confirm(`Delete the site "${s.name}"? This cannot be undone.`)) return;
    await call("DELETE", undefined, `/api/sites?id=${s.id}`);
  }

  if (loading) return <div className="mx-auto max-w-3xl py-10 text-sm text-slate-500">Loading sites…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sites · {sites.length}</h1>
        {canWrite && !adding ? <button onClick={() => setAdding(true)} className="btn-primary text-xs">+ Add site</button> : null}
      </div>
      <p className="text-sm text-slate-600">Every job belongs to a site. A new job reuses a site with the same name. A site can only be deleted once it has no jobs.</p>
      {loaded && !canWrite ? <div className="rounded bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">Your role is read-only — you can browse sites and their jobs.</div> : null}
      {error ? <div role="alert" className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}

      {adding ? (
        <form onSubmit={create} className="card p-3 space-y-2">
          <input value={newSite.name} onChange={(e) => setNewSite({ ...newSite, name: e.target.value })} required minLength={2} maxLength={100} placeholder="Site name *" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input value={newSite.address} onChange={(e) => setNewSite({ ...newSite, address: e.target.value })} maxLength={200} placeholder="Address / location (optional)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary text-xs">{busy ? "Saving…" : "Create site"}</button>
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary text-xs">Cancel</button>
          </div>
        </form>
      ) : null}

      {sites.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          No sites yet. Add one above, or they are created automatically when you create a job.
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/assessments/new" className="btn-primary text-xs">New assessment</Link>
            <Link href="/inspections/new" className="btn-secondary text-xs">New inspection</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {sites.map((s) => {
            const siteJobs = jobs.filter((j) => j.siteId === s.id);
            return (
              <div key={s.id} className="card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    {editing === s.id ? (
                      <div className="space-y-2">
                        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={100} className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" />
                        <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} maxLength={200} placeholder="Address" className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" />
                        <div className="flex gap-2">
                          <button onClick={() => save(s.id)} disabled={busy} className="btn-primary text-xs">Save</button>
                          <button onClick={() => setEditing(null)} className="btn-secondary text-xs">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm font-medium">{s.name}</div>
                        <div className="text-xs text-slate-500">{s.address ?? "No address"} ·{" "}
                          <button onClick={() => setOpen(open === s.id ? null : s.id)} className="underline">{s.jobCount ?? siteJobs.length} job(s)</button>
                        </div>
                      </>
                    )}
                  </div>
                  {editing !== s.id && canWrite ? (
                    <div className="flex gap-3 text-xs">
                      <button onClick={() => { setEditing(s.id); setDraft({ name: s.name, address: s.address ?? "" }); }} className="text-sky-600 hover:underline">Edit</button>
                      {isAdmin ? <button onClick={() => remove(s)} className="text-red-600 hover:underline">Delete</button> : null}
                    </div>
                  ) : null}
                </div>
                {open === s.id ? (
                  <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs">
                    {siteJobs.length === 0 ? <li className="text-slate-500">No jobs at this site yet.</li> : siteJobs.map((j) => (
                      <li key={j.id}>
                        <Link href={`${j.mode === "inspection" ? "/inspections" : "/assessments"}/${j.id}` as never} className="text-sky-700 hover:underline">
                          {j.mode} · {j.pack} · {j.status} · {new Date(j.createdAt).toLocaleDateString()}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
