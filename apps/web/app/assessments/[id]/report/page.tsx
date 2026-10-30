import { ReportView } from "../../../../components/ReportView";

export default function ReportPage({ params }: { params: { id: string } }): JSX.Element {
  return <ReportView id={params.id} basePath="/assessments" />;
}
