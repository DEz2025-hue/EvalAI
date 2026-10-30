"use client";
import { JobCreateForm } from "../../../components/JobCreateForm";

export function InspectionCreateForm({ initialPack = "solar" }: { initialPack?: "solar" | "cctv" }): JSX.Element {
  return <JobCreateForm mode="inspection" initialPack={initialPack} />;
}
