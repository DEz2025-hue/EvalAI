import Link from "next/link";

export default function AssessmentsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Assessments</h1>
        <div className="flex gap-2">
          <Link href="/assessments/new" className="btn-primary">New Solar</Link>
          <Link href="/assessments/new/cctv" className="btn-secondary">New CCTV</Link>
        </div>
      </div>
      <div className="card p-8 text-center text-sm text-slate-500">
        Assessments register — Solar and CCTV share the same engine (mode/pack/status filters via Supabase RLS).
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/assessments/new" className="btn-primary text-xs">Solar workflow</Link>
          <Link href="/assessments/new/cctv" className="btn-secondary text-xs">CCTV workflow</Link>
        </div>
      </div>
    </div>
  );
}
