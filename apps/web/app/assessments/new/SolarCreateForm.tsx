"use client";
import { JobCreateForm } from "../../../components/JobCreateForm";

export function SolarCreateForm(): JSX.Element {
  return <JobCreateForm mode="assessment" initialPack="solar" lockPack />;
}
