import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Start a Solar or CCTV assessment or inspection. Evidence, measurements, and AI drafts stay traceable to their source. Finalized reports are immutable snapshots.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/assessments/new" className="btn-primary">New Assessment</Link>
          <Link href="/inspections" className="btn-secondary">New Inspection</Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Foundation</div>
          <div className="mt-2 text-sm font-medium">Security & workspace</div>
          <p className="mt-1 text-sm text-slate-600">Supabase Auth, RLS deny-by-default, private Storage, server-only secrets. Cross-workspace access denied.</p>
          <div className="mt-3 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">Scaffolding — migrations pending</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Solar first</div>
          <div className="mt-2 text-sm font-medium">Assessment workflow</div>
          <p className="mt-1 text-sm text-slate-600">Create job → context → editable checklist → evidence & measurements → AI findings (Wonder/Spark) → report snapshot.</p>
          <div className="mt-3 inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800">Next: server adapter + RLS</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">AI — server adapter</div>
          <div className="mt-2 text-sm font-medium">Meta Wonder / Spark / Voice</div>
          <p className="mt-1 text-sm text-slate-600">All calls via trusted server. Verify model IDs &amp; limits against live API. Drafts editable, provenance preserved.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="badge bg-slate-900 text-white">Wonder</span>
            <span className="badge bg-slate-200 text-slate-700">Spark</span>
            <span className="badge bg-slate-200 text-slate-700">Voice Transcribe</span>
            <span className="badge bg-slate-100 text-slate-600">SAM 3.1 optional</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Recent jobs</h2>
          <p className="text-xs text-slate-500">Live data will appear once Supabase is connected. No mock counts are shown.</p>
        </div>
        <div className="p-8 text-center text-sm text-slate-500">
          No jobs yet — create an assessment or inspection to begin.
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/assessments/new" className="btn-primary">Start Solar Assessment</Link>
            <Link href="/reports" className="btn-secondary">View reports</Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h3 className="text-sm font-semibold">Coming Soon</h3>
          <p className="mt-1 text-sm text-slate-600">Continuous live-camera AI guidance remains labelled Coming Soon until provider, streaming, privacy and latency are validated.</p>
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-semibold">Docs</h3>
          <p className="mt-1 text-sm text-slate-600">Product, architecture, security, AI &amp; voice, data model, screens, and audit docs live in <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">eval-ai md/</code>.</p>
        </div>
      </div>
    </div>
  );
}
