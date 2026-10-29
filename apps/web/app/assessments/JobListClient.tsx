"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Job = { id: string; siteName?: string; mode: string; pack: string; status: string; context?: Record<string, unknown>; createdAt?: string };

export function JobListClient({ mode, newHref, emptyHint, limit }: { mode: "assessment" | "inspection" | "all"; newHref: string; emptyHint: string; limit?: number }): JSX.Element {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/assessments")
      .then((r) => r.json())
      .then((data) => {
        const items = ((data as { items?: Job[] }).items ?? []) as Job[];
        setJobs((mode === "all" ? items : items.filter((j) => j.mode === mode)).slice(0, limit ?? 50));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [mode, limit]);

  if (error) return <div className="card p-8 text-center text-sm text-red-700">{error}</div>;
  if (!jobs) return <div className="card p-8 text-center text-sm text-slate-500">Loading jobs…</div>;
  if (jobs.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-slate-500">
        {emptyHint}
        <div className="mt-4 flex justify-center gap-2">
          <Link href={newHref} className="btn-primary text-xs">Start {mode === "assessment" ? "assessment" : "inspection"}</Link>
        </div>
      </div>
    );
  }
  const baseFor = (m: string) => (m === "inspection" ? "/inspections" : "/assessments");
  return (
    <div className="space-y-2">
      {jobs.map((j) => (
        <Link key={j.id} href={`${baseFor(j.mode)}/${j.id}`} className="card flex items-center justify-between p-3 hover:bg-slate-50">
          <div>
            <div className="text-sm font-medium">{(j.context as { siteName?: string } | undefined)?.siteName ?? j.siteName ?? j.id.slice(0, 8)}</div>
            <div className="text-xs text-slate-500">{j.pack.toUpperCase()} · {j.mode} · {j.createdAt ? new Date(j.createdAt).toLocaleString() : ""}</div>
          </div>
          <span className={`rounded px-2 py-0.5 text-xs ${j.status === "finalized" ? "bg-green-100 text-green-700" : j.status === "draft" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{j.status}</span>
        </Link>
      ))}
    </div>
  );
}
