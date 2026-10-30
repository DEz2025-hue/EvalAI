"use client";
import { useParams } from "next/navigation";
import { CompletenessView } from "../../../../components/CompletenessView";

export default function CompletenessPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  return <CompletenessView id={params.id as string} basePath="/assessments" />;
}
