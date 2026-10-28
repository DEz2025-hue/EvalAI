import { MaterialsList } from "../../../../components/MaterialsList";
import { QuotationReview } from "../../../../components/QuotationReview";

export default function MaterialsPage({ params }: { params: { id: string } }) {
  const id = params.id;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Materials & quotations · {id.slice(0, 8)}</h1>
        <p className="text-sm text-slate-600">Materials traceable to measurements/findings/rules; quantities provisional if inputs missing. Quotes tied to exact materials version — stale when materials change. Prices never invented.</p>
      </div>
      <div className="card p-4"><MaterialsList assessmentId={id} version={1} /></div>
      <div className="card p-4"><QuotationReview assessmentId={id} materialsVersion={1} /></div>
      <div className="flex gap-2">
        <a href={`/assessments/${id}`} className="btn-secondary text-sm">Back to assessment</a>
        <a href={`/assessments/${id}/report`} className="btn-primary text-sm">Preview report with materials</a>
      </div>
    </div>
  );
}
