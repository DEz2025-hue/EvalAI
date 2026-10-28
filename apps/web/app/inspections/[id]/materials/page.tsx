import { MaterialsList } from "../../../../components/MaterialsList";
import { QuotationReview } from "../../../../components/QuotationReview";

export default function InspectionMaterialsPage({ params, searchParams }: { params: { id: string }; searchParams?: { pack?: string } }) {
  const id = params.id;
  const pack = searchParams?.pack === "cctv" ? "cctv" : "solar";
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Inspection Materials · {id.slice(0, 8)} · {pack}</h1>
      <p className="text-sm text-slate-600">Shares same materials engine as Assessment — traceable rationale, provisional quantities, stale handling.</p>
      <div className="card p-4"><MaterialsList assessmentId={id} version={1} /></div>
      <div className="card p-4"><QuotationReview assessmentId={id} materialsVersion={1} /></div>
      <a href={`/inspections/${id}?pack=${pack}`} className="btn-secondary text-sm">Back to inspection</a>
    </div>
  );
}
