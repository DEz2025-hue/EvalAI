import Link from "next/link";
import { PACK_TEMPLATES, lookForFor, templateItemMeta, type PackId } from "@eval-ai/shared";

function ChecklistBlock({ title, subtitle, items }: { title: string; subtitle: string; items: string[] }): JSX.Element {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title} · {items.length} items</h3>
      <p className="text-xs text-slate-500">{subtitle}</p>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
        {items.map((t) => (
          <li key={t}>
            {t} {templateItemMeta(t)?.required ? <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">required by default</span> : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">optional</span>}
            {lookForFor(t) ? <div className="text-xs text-slate-500">Look for: {lookForFor(t)}</div> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function TemplatesPage(): JSX.Element {
  const packs = (Object.keys(PACK_TEMPLATES) as PackId[]).map((id) => PACK_TEMPLATES[id]);
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div>
        <h1 className="text-xl font-semibold">Templates · {packs.length} packs</h1>
        <p className="text-sm text-slate-600">Starting checklists for each trade. A new installation starts from a site survey; an existing system (and every inspection) starts from a condition check. Templates seed the builder — every job&apos;s list stays editable per assessment, and edits never rewrite the template.</p>
      </div>
      {packs.map((p) => (
        <div key={p.id} className="card p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{p.label}</h2>
              <p className="text-xs text-slate-500">{p.description}</p>
            </div>
            <div className="flex gap-2">
              <Link href={`/assessments/new${p.id === "cctv" ? "/cctv" : ""}`} className="btn-primary text-xs">New {p.label} assessment</Link>
              <Link href={`/inspections/new?pack=${p.id}`} className="btn-secondary text-xs">New inspection</Link>
            </div>
          </div>
          <ChecklistBlock title="New installation" subtitle="Nothing is installed yet: survey the site and plan the work." items={p.newInstallChecklist} />
          <ChecklistBlock title="Existing system" subtitle="Something is installed: check what is there and its condition. Inspections always start here." items={p.checklist} />
        </div>
      ))}
    </div>
  );
}
