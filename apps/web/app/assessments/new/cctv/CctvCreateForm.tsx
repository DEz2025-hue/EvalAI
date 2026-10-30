"use client";
import { JobCreateForm } from "../../../../components/JobCreateForm";

export function CctvCreateForm(): JSX.Element {
  return <JobCreateForm mode="assessment" initialPack="cctv" lockPack />;
}
