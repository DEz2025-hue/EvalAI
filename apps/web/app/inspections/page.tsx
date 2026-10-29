import Link from "next/link";
import { JobListClient } from "../assessments/JobListClient";

export default function InspectionsPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inspections</h1>
        <div className="flex gap-2">
          <Link href={"/inspections/new?pack=solar" as never} className="btn-primary text-sm">New Solar Inspection</Link>
          <Link href={"/inspections/new?pack=cctv" as never} className="btn-secondary text-sm">New CCTV Inspection</Link>
        </div>
      </div>
      <JobListClient mode="inspection" newHref="/inspections/new" emptyHint="Your inspections — same workflow as assessments, with a distinct report title." />
    </div>
  );
}
