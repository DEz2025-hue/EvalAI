import Link from "next/link";
import { JobListClient } from "./JobListClient";

export default function AssessmentsPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Assessments</h1>
        <div className="flex gap-2">
          <Link href="/assessments/new" className="btn-primary">New Solar</Link>
          <Link href="/assessments/new/cctv" className="btn-secondary">New CCTV</Link>
          <Link href="/templates" className="btn-secondary">Templates</Link>
        </div>
      </div>
      <JobListClient mode="assessment" newHref="/assessments/new" emptyHint="Your Solar and CCTV assessments will appear here." />
    </div>
  );
}
