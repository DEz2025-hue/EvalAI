import { InspectionCreateForm } from "./InspectionCreateForm";

export default function NewInspectionPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">New Inspection</h1>
      <p className="text-sm text-slate-600">Inspection checks a site/system against a defined scope. Same engine as Assessment — distinct labels, report title, and checklist framing.</p>
      <InspectionCreateForm />
    </div>
  );
}
