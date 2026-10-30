import { CctvCreateForm } from "./CctvCreateForm";

export default function NewCctvPage(): JSX.Element {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">New Assessment — CCTV</h1>
      <p className="text-sm text-slate-600">Same engine as Solar, different template. Steps: context → clarification → checklist → evidence/voice → AI findings → materials/quotes → versioned report.</p>
      <CctvCreateForm />
      <p className="text-xs text-slate-500">Solar: <a href="/assessments/new" className="underline">create Solar assessment</a></p>
    </div>
  );
}
