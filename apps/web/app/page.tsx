"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Job = {
  id: string;
  siteName?: string;
  mode: string;
  pack: string;
  status: string;
  context?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

type Snapshot = { id: string; assessmentId: string; finalized: boolean; createdAt: string };
type AuditEvent = { id: string; actor: string | null; action: string; targetType: string | null; targetId: string | null; createdAt: string };

function jobName(j: Job): string {
  const ctx = j.context as { siteName?: string } | undefined;
  return ctx?.siteName ?? j.siteName ?? j.id.slice(0, 8);
}

function jobSite(j: Job): string {
  const ctx = j.context as { siteName?: string } | undefined;
  return j.siteName ?? ctx?.siteName ?? "—";
}

function jobHref(j: Job): string {
  const base = j.mode === "inspection" ? "/inspections" : "/assessments";
  return `${base}/${j.id}`;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusBadge(status: string): string {
  if (status === "finalized") return "bg-green-100 text-green-700";
  if (status === "in_progress") return "bg-sky-100 text-sky-800";
  if (status === "review") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

function statusLabel(status: string): string {
  if (status === "in_progress") return "In progress";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function nameFromEmail(email: string | null): string | null {
  if (!email) return null;
  const raw = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  if (!raw) return null;
  return raw.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export default function DashboardPage(): JSX.Element {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [reportCount, setReportCount] = useState<number | null>(null);
  const [siteCount, setSiteCount] = useState<number | null>(null);
  const [activity, setActivity] = useState<AuditEvent[] | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [assessRes, snapRes, siteRes, auditRes] = await Promise.all([
          fetch("/api/assessments"),
          fetch("/api/reports/snapshot"),
          fetch("/api/sites"),
          fetch("/api/audit?limit=8"),
        ]);
        if (assessRes.status === 401) {
          if (!cancelled) setUnauthorized(true);
          return;
        }
        const assessData = (await assessRes.json().catch(() => ({}))) as { items?: Job[]; error?: string };
        if (!assessRes.ok) throw new Error(assessData.error ?? "Failed to load assessments");
        const snapData = (await snapRes.json().catch(() => ({}))) as { snapshots?: Snapshot[] };
        const siteData = (await siteRes.json().catch(() => ({}))) as { sites?: Array<unknown> };
        const auditData = (await auditRes.json().catch(() => ({}))) as { events?: AuditEvent[] };
        if (!cancelled) {
          setJobs((assessData.items ?? []) as Job[]);
          setReportCount((snapData.snapshots ?? []).length);
          setSiteCount((siteData.sites ?? []).length);
          setActivity(auditRes.ok ? (auditData.events ?? []) : []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
      try {
        const { createSupabaseBrowserClient } = await import("@eval-ai/supabase");
        const { data } = await createSupabaseBrowserClient().auth.getUser();
        if (!cancelled) setUserName(nameFromEmail(data.user?.email ?? null));
      } catch {
        /* greeting falls back to a neutral welcome */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => {
    const list = jobs ?? [];
    const completed = list.filter((j) => j.status === "finalized").length;
    return { total: list.length, completed, inProgress: list.length - completed };
  }, [jobs]);

  const recent = useMemo(() => (jobs ?? []).slice(0, 5), [jobs]);
  const resumeTarget = useMemo(() => (jobs ?? []).find((j) => j.status !== "finalized") ?? null, [jobs]);

  if (unauthorized) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg font-semibold">Sign in to view your dashboard</h1>
        <p className="mt-1 text-sm leading-6 text-slate-600">Your workspace metrics, assessments, and activity appear here once you sign in.</p>
        <Link href="/auth/sign-in" className="btn-primary mt-4">Sign in</Link>
      </div>
    );
  }

  if (error) return <div className="card p-8 text-center text-sm text-red-700">{error}</div>;
  if (!jobs) return <div className="card p-8 text-center text-sm text-slate-500">Loading your workspace…</div>;

  const greeting = greetingFor(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}
            {userName ? `, ${userName}` : ""}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            {metrics.total === 0
              ? "Your workspace is ready — create your first assessment to get started."
              : `Your workspace has ${metrics.total} assessment${metrics.total === 1 ? "" : "s"}${siteCount !== null ? ` across ${siteCount} site${siteCount === 1 ? "" : "s"}` : ""}, with ${metrics.inProgress} in progress and ${metrics.completed} completed.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/assessments/new" className="btn-primary">+ New Assessment</Link>
          <Link href="/inspections/new" className="btn-secondary">New Inspection</Link>
        </div>
      </div>

      <section aria-label="Overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total assessments", value: metrics.total },
          { label: "In-progress assessments", value: metrics.inProgress },
          { label: "Completed assessments", value: metrics.completed },
          { label: "Reports generated", value: reportCount ?? "—" },
        ].map((c) => (
          <div key={c.label} className="card p-5">
            <div className="text-sm text-slate-500">{c.label}</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight">{c.value}</div>
          </div>
        ))}
      </section>

      <section aria-label="Recent assessments" className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Recent assessments</h2>
            <p className="text-xs text-slate-500">Your latest assessments and inspections.</p>
          </div>
          <Link href="/assessments" className="text-xs font-medium text-sky-700 hover:underline">View all</Link>
        </div>
        {recent.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No assessments yet — create one to begin.
            <div className="mt-4">
              <Link href="/assessments/new" className="btn-primary text-xs">Start assessment</Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Assessment</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Site / Project</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Last updated</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((j) => (
                  <tr key={j.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{jobName(j)}</td>
                    <td className="px-4 py-3 text-slate-600">{jobSite(j)}</td>
                    <td className="px-4 py-3 text-slate-600">{j.pack ? j.pack.toUpperCase() : "—"} · {j.mode}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(j.updatedAt ?? j.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadge(j.status)}`}>{statusLabel(j.status)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={jobHref(j)} className="text-xs font-medium text-sky-700 hover:underline">Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="Quick actions" className="card p-4">
          <h2 className="text-sm font-semibold">Quick actions</h2>
          <div className="mt-3 space-y-2">
            <Link href="/assessments/new" className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium transition hover:border-slate-300 hover:bg-slate-50">
              Start a new assessment <span aria-hidden="true">→</span>
            </Link>
            {resumeTarget ? (
              <Link href={jobHref(resumeTarget)} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium transition hover:border-slate-300 hover:bg-slate-50">
                Resume: {jobName(resumeTarget)} <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <Link href="/assessments" className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium transition hover:border-slate-300 hover:bg-slate-50">
                Browse assessments <span aria-hidden="true">→</span>
              </Link>
            )}
            <Link href="/reports" className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium transition hover:border-slate-300 hover:bg-slate-50">
              View completed reports <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
        <section aria-label="Live camera" className="card p-4">
          <h2 className="text-sm font-semibold">Live camera guidance <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">Coming Soon</span></h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Continuous AI guidance from a live camera is not available yet. Use photo capture and on-request analysis instead.</p>
        </section>
        {activity !== null && activity.length > 0 ? (
          <section aria-label="Recent activity" className="card p-4">
            <h2 className="text-sm font-semibold">Recent activity</h2>
            <ul className="mt-3 space-y-2.5">
              {activity.slice(0, 5).map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="font-medium">{a.action}</span>
                  {a.targetId ? <span className="text-slate-500"> · {a.targetId.slice(0, 8)}</span> : null}
                  <div className="text-xs text-slate-500">{formatDate(a.createdAt)}</div>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section aria-label="AI assistance" className="card p-4">
            <h2 className="text-sm font-semibold">AI assistance</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Request AI-assisted analysis and clarifications from any assessment. Every draft is editable and never overwrites your verified facts.</p>
            {resumeTarget ? (
              <Link href={jobHref(resumeTarget)} className="mt-3 inline-flex text-xs font-medium text-sky-700 hover:underline">Continue {jobName(resumeTarget)} →</Link>
            ) : (
              <Link href="/assessments/new" className="mt-3 inline-flex text-xs font-medium text-sky-700 hover:underline">Start assessment →</Link>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
