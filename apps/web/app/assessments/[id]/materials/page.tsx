import { MaterialsWorkspace } from "../../../../components/MaterialsWorkspace";

export default function MaterialsPage({ params }: { params: { id: string } }): JSX.Element {
  return <MaterialsWorkspace id={params.id} basePath="/assessments" />;
}
