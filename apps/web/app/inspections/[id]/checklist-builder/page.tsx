"use client";
import { useParams } from "next/navigation";
import { ChecklistBuilder } from "../../../../components/ChecklistBuilder";

export default function InspectionChecklistBuilderPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  return <ChecklistBuilder id={params.id as string} basePath="/inspections" />;
}
