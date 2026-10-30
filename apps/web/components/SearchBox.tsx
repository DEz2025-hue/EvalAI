"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Job = { id: string; siteName?: string; mode: string; pack: string; status: string; context?: Record<string, unknown> };
type Site = { id: string; name: string; address?: string };
type Snap = { id: string; assessmentId: string; finalized: boolean };

type Result = { key: string; group: string; title: string; detail: string; href: string };

function jobName(j: Job): string {
  return ((j.context as { siteName?: string } | undefined)?.siteName ?? j.siteName ?? j.id.slice(0, 8));
}

export default function SearchBox(): JSX.Element {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function ensureLoaded() {
    if (loaded) return;
    try {
      const [a, s, r] = await Promise.all([fetch("/api/assessments"), fetch("/api/sites"), fetch("/api/reports/snapshot")]);
      const [ad, sd, rd] = await Promise.all([a.json().catch(() => ({})), s.json().catch(() => ({})), r.json().catch(() => ({}))]);
      setJobs(((ad as { items?: Job[] }).items ?? []) as Job[]);
      setSites(((sd as { sites?: Site[] }).sites ?? []) as Site[]);
      setSnaps(((rd as { snapshots?: Snap[] }).snapshots ?? []) as Snap[]);
    } catch {
      /* search stays empty rather than erroring */
    } finally {
      setLoaded(true);
    }
  }

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Result[] = [];
    for (const j of jobs) {
      const hay = `${jobName(j)} ${j.siteName ?? ""} ${j.id} ${j.pack} ${j.mode} ${j.status}`.toLowerCase();
      if (hay.includes(q)) {
        out.push({
          key: `job-${j.id}`,
          group: j.mode === "inspection" ? "Inspections" : "Assessments",
          title: jobName(j),
          detail: `${j.pack ? j.pack.toUpperCase() : ""} · ${j.status}`,
          href: `${j.mode === "inspection" ? "/inspections" : "/assessments"}/${j.id}`,
        });
      }
    }
    for (const s of sites) {
      if (`${s.name} ${s.address ?? ""} ${s.id}`.toLowerCase().includes(q)) {
        out.push({ key: `site-${s.id}`, group: "Sites", title: s.name, detail: s.address ?? "Site", href: "/sites" });
      }
    }
    for (const s of snaps) {
      if (`${s.id} ${s.assessmentId}`.toLowerCase().includes(q)) {
        out.push({
          key: `rep-${s.id}`,
          group: "Reports",
          title: `Report ${s.id.slice(0, 8)}`,
          detail: s.finalized ? "finalized" : "draft",
          href: `/assessments/${s.assessmentId}/report`,
        });
      }
    }
    return out.slice(0, 12);
  }, [query, jobs, sites, snaps]);

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative hidden min-w-0 flex-1 max-w-md md:block">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true">
        <path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3" />
      </svg>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          ensureLoaded();
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search assessments, sites, reports…"
        aria-label="Search assessments, sites, and reports"
        role="combobox"
        aria-expanded={showDropdown}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
      />
      {showDropdown ? (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg" role="listbox" aria-label="Search results">
          {!loaded ? (
            <div className="px-4 py-3 text-sm text-slate-500">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500">No matches for “{query.trim()}”.</div>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1.5">
              {results.map((r) => (
                <li key={r.key}>
                  <Link
                    href={r.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 px-4 py-2 text-sm transition hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{r.title}</span>
                      <span className="block truncate text-xs text-slate-500">{r.group} · {r.detail}</span>
                    </span>
                    <span aria-hidden="true" className="shrink-0 text-slate-400">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
