"use client";
import { useParams } from "next/navigation";
import { FindingsView } from "../../../../components/FindingsView";

export default function FindingsPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  return <FindingsView id={params.id as string} basePath="/assessments" />;
}
