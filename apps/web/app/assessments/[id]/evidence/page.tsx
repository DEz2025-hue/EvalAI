"use client";
import { useParams } from "next/navigation";
import { EvidenceGallery } from "../../../../components/EvidenceGallery";

export default function EvidencePage(): JSX.Element {
  const params = useParams<{ id: string }>();
  return <EvidenceGallery id={params.id as string} basePath="/assessments" />;
}
