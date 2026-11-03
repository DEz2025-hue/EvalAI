import { SourceBadge, type ItemSource } from "./SourceBadge";

type Item = { id: string; title: string; required: boolean; source?: ItemSource };
type Resp = { itemId: string; status: string };

const STATUS: Record<string, { label: string; className: string }> = {
  not_checked: { label: "Not Checked", className: "bg-slate-100 text-slate-600" },
  pass: { label: "Pass", className: "bg-green-50 text-green-700 border border-green-200" },
  fail: { label: "Issue / Fail", className: "bg-red-50 text-red-700 border border-red-200" },
  needs_attention: { label: "Needs Attention", className: "bg-amber-50 text-amber-800 border border-amber-200" },
  not_applicable: { label: "N/A", className: "bg-sky-50 text-sky-700 border border-sky-200" },
};

/**
 * Read-only view of the checklist on the job page. Answers are recorded only in the walk-through, so there is one place
 * that saves them (and one set of rules); each item links to the walk-through at that item.
 */
export function ChecklistSummary({ items, responses, walkthroughHref }: { items: Item[]; responses: Resp[]; walkthroughHref: string }): JSX.Element {
  const byItem = new Map(responses.map((r) => [r.itemId, r.status]));
  const statusOf = (id: string) => byItem.get(id) ?? "not_checked";
  const checked = items.filter((it) => statusOf(it.id) !== "not_checked").length;
  const requiredLeft = items.filter((it) => it.required && statusOf(it.id) === "not_checked").length;
  const pct = items.length ? Math.round((checked / items.length) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={checked} aria-valuemin={0} aria-valuemax={items.length}>
          <div className="h-full bg-slate-900" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-slate-600">
          {checked} of {items.length} checked{requiredLeft > 0 ? ` · ${requiredLeft} required still to do` : ""}
        </p>
      </div>
      <a href={walkthroughHref} className="btn-primary inline-flex text-sm">{checked === 0 ? "Start checking" : checked < items.length ? "Continue checking" : "Review answers"} →</a>
      <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {items.map((it) => {
          const s = STATUS[statusOf(it.id)] ?? STATUS.not_checked;
          return (
            <li key={it.id}>
              <a href={`${walkthroughHref}?item=${encodeURIComponent(it.id)}`} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                <span className="flex-1">{it.title}</span>
                {it.source && it.source !== "established" ? <SourceBadge source={it.source} /> : null}
                {it.required && statusOf(it.id) === "not_checked" ? <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">required</span> : null}
                <span className={`rounded-full px-2 py-0.5 text-xs ${s.className}`}>{s.label}</span>
              </a>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-slate-500">Not Checked ≠ Pass. Answers are recorded in the walk-through, one item at a time.</p>
    </div>
  );
}
