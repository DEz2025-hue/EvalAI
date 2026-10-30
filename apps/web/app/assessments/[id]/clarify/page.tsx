"use client";
import { useParams } from "next/navigation";
import { ClarifyView } from "../../../../components/ClarifyView";

export default function ClarifyPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  return <ClarifyView id={params.id as string} basePath="/assessments" />;
}
