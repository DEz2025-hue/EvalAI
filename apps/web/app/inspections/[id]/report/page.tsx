import { ReportView } from "../../../../components/ReportView";

export default function InspectionReportPage({ params }: { params: { id: string } }): JSX.Element {
  return <ReportView id={params.id} basePath="/inspections" />;
}
