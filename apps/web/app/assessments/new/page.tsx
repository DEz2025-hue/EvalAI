import { SolarCreateForm } from "./SolarCreateForm";

export default function NewAssessmentPage(): JSX.Element {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">New Assessment — Solar</h1>
      <p className="text-sm text-slate-600">Add site details, then work through context, checklist, evidence, measurements, and your report.</p>
      <SolarCreateForm />
    </div>
  );
}
