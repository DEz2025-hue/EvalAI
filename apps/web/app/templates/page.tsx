import Link from "next/link";
import { PACK_TEMPLATES, type PackId } from "@eval-ai/shared";

export default function TemplatesPage(): JSX.Element {
  const packs = (Object.keys(PACK_TEMPLATES) as PackId[]).map((id) => PACK_TEMPLATES[id]);
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div>
        <h1 className="text-xl font-semibold">Templates · {packs.length} packs</h1>
        <p className="text-sm text-slate-600">Starting checklists for each trade. Templates seed the builder — every job's list stays editable per assessment, and edits never rewrite the template.</p>
      </div>
      {packs.map((p) => (
        <div key={p.id} className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">{p.label}</h2>
              <p className="text-xs text-slate-500">{p.description} · {p.checklist.length} items</p>
            </div>
            <div className="flex gap-2">
              <Link href={`/assessments/new${p.id === "cctv" ? "/cctv" : ""}`} className="btn-primary text-xs">New {p.label} assessment</Link>
              <Link href={`/inspections/new?pack=${p.id}`} className="btn-secondary text-xs">New inspection</Link>
            </div>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            {p.checklist.map((title, i) => (
              <li key={i}>{title} {i < 5 ? <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">required by default</span> : null}</li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
