import Link from "next/link";

export default function InspectionsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inspections</h1>
        <div className="flex gap-2">
          <Link href={"/inspections/new?pack=solar" as never} className="btn-primary text-sm">New Solar Inspection</Link>
          <Link href={"/inspections/new?pack=cctv" as never} className="btn-secondary text-sm">New CCTV Inspection</Link>
        </div>
      </div>
      <div className="card p-8 text-center text-sm text-slate-500">
        Inspection register — shares same Supabase RLS & evidence engine as Assessments, distinct report title.
        <div className="mt-4 flex justify-center gap-2">
          <Link href={"/inspections/new" as never} className="btn-primary text-xs">Start inspection</Link>
          <Link href="/assessments" className="btn-secondary text-xs">View assessments</Link>
        </div>
      </div>
    </div>
  );
}
