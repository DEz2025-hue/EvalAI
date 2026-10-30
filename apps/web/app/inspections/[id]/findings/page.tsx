"use client";
import { useParams } from "next/navigation";
import { FindingsView } from "../../../../components/FindingsView";

export default function InspectionFindingsPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  return <FindingsView id={params.id as string} basePath="/inspections" />;
}
