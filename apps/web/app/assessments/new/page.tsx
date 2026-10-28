import { SolarCreateForm } from "./SolarCreateForm";

export default function NewAssessmentPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">New Assessment — Solar</h1>
      <p className="text-sm text-slate-600">Steps: choose mode/pack → site &amp; context → clarification → checklist → capture → AI analysis → report snapshot. CCTV follows Solar.</p>
      <SolarCreateForm />
    </div>
  );
}
