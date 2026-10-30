"use client";
import { useParams } from "next/navigation";
import { ChecklistWalkthrough } from "../../../../components/ChecklistWalkthrough";

export default function InspectionChecklistPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  return <ChecklistWalkthrough id={params.id as string} basePath="/inspections" />;
}
