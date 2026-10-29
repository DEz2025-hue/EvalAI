import Link from "next/link";
import { JobListClient } from "./assessments/JobListClient";

export default function DashboardPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Start a Solar or CCTV assessment or inspection. Capture evidence, measurements, and AI-assisted drafts — all linked to their source. Finalized reports are versioned and shareable.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/assessments/new" className="btn-primary">New Assessment</Link>
          <Link href="/inspections" className="btn-secondary">New Inspection</Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Assessment</div>
          <div className="mt-2 text-sm font-semibold">Solar & CCTV assessments</div>
          <p className="mt-1 text-sm leading-5 text-slate-600">Create a job, add site context, work through an editable checklist, capture photos and voice notes, and generate a report.</p>
          <Link href="/assessments/new" className="mt-3 inline-flex text-xs font-medium text-sky-700 hover:underline">Start assessment →</Link>
        </div>
        <div className="card p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Inspection</div>
          <div className="mt-2 text-sm font-semibold">Inspections with the same workflow</div>
          <p className="mt-1 text-sm leading-5 text-slate-600">Check a site or system against a defined scope. Distinct report title, same checklist statuses, evidence, and measurements.</p>
          <Link href="/inspections/new" className="mt-3 inline-flex text-xs font-medium text-sky-700 hover:underline">Start inspection →</Link>
        </div>
        <div className="card p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">AI assistance</div>
          <div className="mt-2 text-sm font-semibold">Draft findings, editable before you save</div>
          <p className="mt-1 text-sm leading-5 text-slate-600">Request AI-assisted analysis and clarifications. Every draft is editable, shows what&apos;s missing, and never overwrites your verified facts.</p>
          <span className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">On request only</span>
        </div>
      </div>

      <div className="card">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Recent jobs</h2>
          <p className="text-xs text-slate-500">Your latest assessments and inspections.</p>
        </div>
        <div className="p-4">
          <JobListClient mode="all" newHref="/assessments/new" emptyHint="No jobs yet — create an assessment or inspection to begin." limit={5} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h3 className="text-sm font-semibold">Live Camera Analysis — Coming Soon</h3>
          <p className="mt-1 text-sm leading-5 text-slate-600">Continuous live-camera guidance isn&apos;t available in this release. Use photo capture and on-demand analysis today.</p>
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-semibold">Need help?</h3>
          <p className="mt-1 text-sm leading-5 text-slate-600">Create a job to walk through the full flow: context → checklist → evidence → measurements → report.</p>
          <div className="mt-3 flex gap-2">
            <Link href="/assessments/new" className="text-xs font-medium text-sky-700 hover:underline">New Solar assessment</Link>
            <Link href="/inspections/new" className="text-xs font-medium text-sky-700 hover:underline">New inspection</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
